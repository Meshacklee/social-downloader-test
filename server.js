const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// Helper function to get yt-dlp path
function getYtDlpPath() {
    const isWindows = process.platform === 'win32';
    const ytDlpPath = path.join(__dirname, isWindows ? 'yt-dlp.exe' : 'yt-dlp');
    
    if (!fs.existsSync(ytDlpPath)) {
        throw new Error(`yt-dlp not found at: ${ytDlpPath}`);
    }
    
    return ytDlpPath;
}

// Example download function
function downloadVideo(url, format = 'best') {
    return new Promise((resolve, reject) => {
        const ytDlpPath = getYtDlpPath();

        // Ensure downloads directory exists
        const downloadsDirectory = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadsDirectory)) {
            fs.mkdirSync(downloadsDirectory, { recursive: true });
        }

        console.log('Starting download for:', url);

        // Spawn yt-dlp process
        const ytDlpProcess = spawn(ytDlpPath, [
            url,
            '-f', 'bv*+ba/b',
            '-o', path.join(downloadsDirectory, '%(title)s.%(ext)s'),
            '--newline',
            '--no-check-certificate'
        ]);

        let output = '';
        let errorOutput = '';

        ytDlpProcess.on('error', (err) => {
            console.error('yt-dlp process error:', err);
            reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        });

        ytDlpProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log('yt-dlp output:', data.toString().trim());
        });

        ytDlpProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log('yt-dlp error:', data.toString().trim());
        });

        ytDlpProcess.on('close', (code) => {
            console.log(`yt-dlp process exited with code ${code}`);

            if (code === 0) {
                // Success - find the downloaded file
                try {
                    const finalFiles = fs.readdirSync(downloadsDirectory);
                    const newFiles = finalFiles.filter(file => !initialFiles.includes(file));

                    if (newFiles.length > 0) {
                        const filename = newFiles[0];
                        const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;

                        resolve({
                            success: true,
                            title: filename.replace(/\.[^/.]+$/, ""),
                            downloadUrl: downloadUrl,
                            filename: filename
                        });
                    } else {
                        // Fallback to most recent file
                        const recentFile = getMostRecentFile(downloadsDirectory);
                        if (recentFile) {
                            const downloadUrl = `/downloads/${encodeURIComponent(recentFile)}`;
                            resolve({
                                success: true,
                                title: recentFile.replace(/\.[^/.]+$/, ""),
                                downloadUrl: downloadUrl,
                                filename: recentFile
                            });
                        } else {
                            reject(new Error('File not found after download'));
                        }
                    }
                } catch (fileError) {
                    reject(new Error('Could not read downloads directory: ' + fileError.message));
                }
            } else {
                reject(new Error(`Download failed with code ${code}: ${errorOutput || 'Unknown error'}`));
            }
        });
    });
}