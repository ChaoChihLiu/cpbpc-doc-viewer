import express from 'express';
import fetch from 'node-fetch';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

                    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 }); // URL expires in 1 hour
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

// Route handler to display hymn images from S3
app.get('/hymn/:bucket/:hymnNum', async (req, res) => {
    const hymnNum = req.params.hymnNum;
    const bucket = req.params.bucket;

    try {
        const imageUrls = await searchS3Objects(bucket, hymnNum, '.jpg');
        console.info('Generated pre-signed URLs:', imageUrls);

        // Render the viewer template and pass the image URLs
        res.render('viewer', { imageUrls });
    } catch (error) {
        console.error('Error processing hymn images:', error);
        res.status(500).send('Error processing hymn images');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
