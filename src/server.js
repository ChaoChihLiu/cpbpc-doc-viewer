import express from 'express';
import fetch from 'node-fetch';
import {degrees, PDFDocument, rgb, StandardFonts} from 'pdf-lib';
import {exec} from 'child_process';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import util from 'util';
import {GetObjectCommand, ListObjectsV2Command, S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'
import {v4 as uuidv4} from 'uuid'
import _ from 'lodash'
import env from 'dotenv'
import logger from './logger.js'
import pool from "./dbConnPool.js"
import mysql from "mysql2/promise"

env.config();
const showHymnScores = process.env.show_hymn_scores === 'true'
const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;
app.use(express.json());

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../src/views')); // Adjust the path to your views directory

// Serve static files from the 'images' directory
app.use('/images', express.static(path.join(__dirname, '../images')));

const addWatermarkToPdf = async (pdfBytes) => {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold); // Use a bold font for better visibility
    const watermarkText = 'Calvary Pandan Use Only';
    const fontSize = 10;
    const rotationAngle = 45; // Rotation in degrees

    const pages = pdfDoc.getPages();
    pages.forEach(page => {
        const { width, height } = page.getSize();
        const textWidth = helveticaFont.widthOfTextAtSize(watermarkText, fontSize);
        const textHeight = fontSize;

        const margin = 20;

        // Adjust spacing between watermarks
        const horizontalSpacing = textWidth + 50; // Adjust spacing to allow better overlap
        const verticalSpacing = textHeight + 50;

        // Calculate number of rows and columns required
        const numRows = Math.ceil((height - 2 * margin) / verticalSpacing);
        const numCols = Math.ceil((width - 2 * margin) / horizontalSpacing);

        for (let row = 0; row < numRows; row++) {
            for (let col = 0; col < numCols; col++) {
                const posX = margin + col * horizontalSpacing;
                const posY = height - margin - row * verticalSpacing; // Adjust Y position to be within page

                // Draw the watermark text with rotation
                page.drawText(watermarkText, {
                    x: posX,
                    y: posY,
                    size: fontSize,
                    font: helveticaFont,
                    color: rgb(1, 0, 0), // Red color
                    opacity: 0.2, // Transparency
                    rotate: degrees(rotationAngle), // Rotate text
                });
            }
        }
    });

    return await pdfDoc.save();
};

const convertPdfToJpeg = async (pdfPath, outputPath, pageCount) => {
    const command = `pdftoppm -jpeg ${pdfPath} ${outputPath}`;
    console.log('Running command:', command);
    try {
        const { stdout, stderr } = await execPromise(command);
        if (stderr) {
            console.error('Conversion stderr:', stderr);
            throw new Error(`Error converting PDF to image: ${stderr}`);
        }
        console.log('Conversion stdout:', stdout);
        console.log('Conversion stderr:', stderr);

        // Collect all generated images
        const images = [];
        let pageNum = 1;
        let padNum = 1
        if( pageCount >= 10 ){
            padNum = 2
        }
        while (fs.existsSync(`${outputPath}-${String(pageNum).padStart(padNum, '0')}.jpg`)) {
            const imagePath = `${outputPath}-${String(pageNum).padStart(padNum, '0')}.jpg`;
            console.log('Found image:', imagePath);
            images.push(imagePath);
            pageNum++;
        }

        if (images.length === 0) {
            throw new Error('No images were generated.');
        }

        return images;
    } catch (error) {
        throw new Error(`Error converting PDF to image: ${error.message}`);
    }
};

const getPdfPageCount = async (pdfBytes) => {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    return pdfDoc.getPageCount();
}
const cleanDirectorySync = (directoryPath) => {
    try {
        // Read all files in the directory
        const files = fs.readdirSync(directoryPath);

        // Loop through each file and delete it
        for (const file of files) {
            const filePath = path.join(directoryPath, file);
            const stat = fs.statSync(filePath);

            if (stat.isFile()) {
                fs.unlinkSync(filePath); // Delete file
                console.log(`Deleted file: ${filePath}`);
            } else if (stat.isDirectory()) {
                cleanDirectorySync(filePath); // Recursively clean subdirectories
                fs.rmdirSync(filePath); // Remove empty directory
                console.log(`Deleted directory: ${filePath}`);
            }
        }
        console.log('Directory cleanup complete.');
    } catch (error) {
        console.error(`Error cleaning directory: ${error.message}`);
    }
}
app.get('/weekly/:service', async (req, res) => {
    const service = req.params.service
    const pdfUrl = `https://cpbpc-documents.s3-ap-southeast-1.amazonaws.com/Worship/${service}.pdf`

    try {
        const response = await fetch(pdfUrl);
        if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const pdfBytes = Buffer.from(arrayBuffer);

        // Ensure the output directory exists
        const imagesDir = path.join(__dirname, `../images/${service}`);
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir);
        }else{
            cleanDirectorySync(imagesDir)
        }

        const pageCount = await getPdfPageCount(pdfBytes);
        // Add watermark to PDF
        // const watermarkedPdfBytes = await addWatermarkToPdf(pdfBytes);
        const tempPdfPath = path.join(__dirname, `../images/${service}/${service}.pdf`);
        fs.writeFileSync(tempPdfPath, pdfBytes);

        // Convert to JPEG
        const outputPath = path.join(imagesDir, 'output')
        const imagePaths = await convertPdfToJpeg(tempPdfPath, outputPath, pageCount);

        // Send response with HTML that shows all images
        res.render('viewer', { docName: 'Church Weekly', imagePaths: imagePaths.map(img => `${service}/${path.relative(imagesDir, img)}`) });

        // Clean up
        // fs.unlinkSync(tempPdfPath);
        // imagePaths.forEach(file => fs.unlinkSync(file));
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).send('Error processing PDF');
    }
});

const s3 = new S3Client({ region: 'ap-southeast-1' });

// Function to search for objects with a given prefix and postfix in S3
async function searchS3Objects(bucketName, prefix, postfix) {
    let continuationToken = null;
    const matchingUrls = [];

    do {
        const params = {
            Bucket: bucketName,
            Prefix: `${prefix}_`,
            ContinuationToken: continuationToken
        };

        try {
            const data = await s3.send(new ListObjectsV2Command(params));

            for (const object of data.Contents) {
                if (object.Key.startsWith(`${prefix}_`) && object.Key.endsWith(postfix)) {
                    // Generate a pre-signed URL for the object
                    const command = new GetObjectCommand({
                        Bucket: bucketName,
                        Key: object.Key
                    });

                    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 }); // URL expires in 1 hour
                    matchingUrls.push(signedUrl);
                }
            }

            continuationToken = data.IsTruncated ? data.NextContinuationToken : null;

        } catch (err) {
            console.error('Error listing objects:', err);
            break;
        }
    } while (continuationToken);

    return matchingUrls;
}

async function searchS3KeyName(bucketName, hymnCode) {
    let continuationToken = null;
    let objectKey = 'CPBPC Document Viewer'

    const hymnNum = await queryHymnNumber(hymnCode)

    do {
        const params = {
            Bucket: bucketName,
            Prefix: `${hymnNum}_`,
            ContinuationToken: continuationToken
        };

        try {
            const data = await s3.send(new ListObjectsV2Command(params));

            for (const object of data.Contents) {
                if (object.Key.startsWith(`${hymnNum}_`)) {
                    objectKey = object.Key
                    if( objectKey.includes('/') ){
                        objectKey = objectKey.split("/")[0]
                    }
                }
            }

            continuationToken = data.IsTruncated ? data.NextContinuationToken : null;

        } catch (err) {
            console.error('Error listing objects:', err);
            break;
        }
    } while (continuationToken);

    return objectKey;
}

const codes = []

async function verifyAccessKey(accessKey) {
    let queryStat = `
        SELECT *
        FROM cpbpc_hymn_access
        WHERE key_create_time >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
            and access_key = ?
    `;
    logger.info(`query statement : ${mysql.format(queryStat, [accessKey])}`)
    let [rows, fields] = await pool.query(queryStat, [accessKey])
    if( !rows || _.isEmpty(rows) ){
        return false
    }
    
    return true
}

async function queryHymnNumber(hymnCode) {
    let queryStat = `
        SELECT *
        FROM cpbpc_hymn
        WHERE  alias = ?
    `;
    logger.info(`query statement : ${mysql.format(queryStat, [hymnCode])}`)
    let [rows, fields] = await pool.query(queryStat, [hymnCode])
    if( !rows || _.isEmpty(rows) ){
        return 0
    }

    return rows[0]['seq_no']
}

// Route handler to display hymn images from S3
app.get('/:accessKey/cpbpc-hymn/:hymnCode', async (req, res) => {

    if( !showHymnScores || showHymnScores == false ){
        res.status(404).send('Resource Not Found')
        return
    }

    const accessKey = req.params.accessKey;
    const hymnCode = req.params.hymnCode;
    // const bucket = req.params.bucket;
    const bucket = 'cpbpc-hymn'

    try {
        const isValidKey = await verifyAccessKey(accessKey)
        if( !isValidKey ){
            res.status(404).send('Access Key invalid, search hymn again')
            return
        }

        const docName = await searchS3KeyName(bucket, hymnCode);
        const code = uuidv4()
        codes.push(code)
        // console.info(`hymnName is ${docName}`)
        // const imageUrls = await searchS3Objects(bucket, hymnNum, '.jpg');
        // console.info('Generated pre-signed URLs:', imageUrls);

        // Render the viewer template and pass the image URLs
        // res.render('securedViewer', { imageUrls, docName });
        res.render('securedViewer', { docName, bucket, hymnCode, code });
    } catch (error) {
        console.error('Error processing hymn images:', error);
        res.status(500).send('Error processing hymn images');
    }
});

app.post('/load-images', async (req, res) => {
    if( !showHymnScores || showHymnScores == false ){
        res.status(404).send('Resource Not Found');
        return
    }

    console.info(`req body ${JSON.stringify(req.body)}`)
    const { bucketName, hymnCode, code } = req.body;

    try {
        if(!_.includes(codes, code)){
            res.status(404).send('Hymn not found')
            return
        }
        _.remove(codes, (value) => value === code)

        if (bucketName && hymnCode) {
            const hymnNum = await queryHymnNumber(hymnCode)
            const imageUrls = await searchS3Objects(bucketName, hymnNum, '_watermarked.jpg');
            console.info('Generated pre-signed URLs:', imageUrls);

            res.json(imageUrls);
        } else {
            res.status(400).send('Missing bucketName or hymnNum');
        }
    } catch (error) {
        console.error('Error processing hymn images:', error);
        res.status(500).send('Error processing hymn images');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
