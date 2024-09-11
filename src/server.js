import express from 'express';
import fetch from 'node-fetch';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

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
        res.render('viewer', { imagePaths: imagePaths.map(img => `${service}/${path.relative(imagesDir, img)}`) });

        // Clean up
        // fs.unlinkSync(tempPdfPath);
        // imagePaths.forEach(file => fs.unlinkSync(file));
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).send('Error processing PDF');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
