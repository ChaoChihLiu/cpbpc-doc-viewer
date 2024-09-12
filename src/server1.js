import express from 'express';
import fetch from 'node-fetch';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Poppler from 'pdf-poppler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json());

app.get('/api/pnw', async (req, res) => {
    const pdfUrl = 'https://cpbpc-documents.s3-ap-southeast-1.amazonaws.com/Worship/pnw.pdf'; // Replace with your PDF URL

    try {
        const response = await fetch(pdfUrl);
        if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);

        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const watermarkText = 'Calvary Pandan Use Only';
        const fontSize = 50;

        const pages = pdfDoc.getPages();
        pages.forEach(page => {
            const { width, height } = page.getSize();
            const textWidth = helveticaFont.widthOfTextAtSize(watermarkText, fontSize);
            const textHeight = fontSize;

            const x = (width - textWidth) / 2;
            const y = (height - textHeight) / 2;

            page.drawText(watermarkText, {
                x,
                y,
                size: fontSize,
                font: helveticaFont,
                color: rgb(1, 0, 0),
                opacity: 0.3,
            });
        });

        const pdfBytes = await pdfDoc.save();
        const tempPdfPath = path.join(__dirname, 'temp.pdf');
        fs.writeFileSync(tempPdfPath, pdfBytes);

        // Convert PDF to images using Poppler
        const options = {
            format: 'jpeg',
            out_dir: __dirname,
            out_prefix: 'output',
            page: null, // Converts all pages
        };

        await Poppler.convert(tempPdfPath, options);

        // Assume single page PDF for simplicity, load the first converted image
        const tempImagePath = path.join(__dirname, 'output-1.jpg');
        const imageBuffer = fs.readFileSync(tempImagePath);

        // Send the image as a response
        res.setHeader('Content-Type', 'image/jpeg');
        res.send(imageBuffer);

        // Clean up: Delete the temporary files
        fs.unlinkSync(tempPdfPath);
        fs.unlinkSync(tempImagePath);
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).send('Error processing PDF');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
