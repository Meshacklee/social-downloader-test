const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const multer = require('multer');

console.log('=== SERVER STARTING ===');

const app = express();
const PORT = process.env.PORT || 10000; // Use Render's default port

// Configure multer for cookie file uploads
const upload = multer({
    dest: 'cookies/',
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Middleware
app.use(express.json({ limit: '10mb' })); // Increase limit for large payloads if needed
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CRITICAL: Serve downloaded videos with proper path resolution
const downloadsDir = path.resolve(__dirname, 'downloads'); // Use resolve for absolute path
console.log(`Downloads directory set to: ${downloadsDir}`);
app.use('/downloads', express.static(downloadsDir, {
    // Consider removing setHeaders unless you have specific mime-type needs,
    // as Express/Node usually handles them correctly.
    // setHeaders: (res, filePath) => {
    //     ...
    // }
}));

// Ensure downloads directory exists
if (!fs.existsSync(downloadsDir)) {
    try {
        fs.mkdirSync(downloadsDir, { recursive: true });
        console.log('Created downloads directory:', downloadsDir);
    } catch (err) {
        console.error('Failed to create downloads directory:', err);
        // Critical failure - might want to exit or handle appropriately
        // process.exit(1);
    }
} else {
    console.log('Downloads directory already exists:', downloadsDir);
}

// Serve cookie files (only for internal use)
const cookiesDir = path.resolve(__dirname, 'cookies');
app.use('/cookies', express.static(cookiesDir));

// Ensure cookies directory exists
if (!fs.existsSync(cookiesDir)) {
    try {
        fs.mkdirSync(cookiesDir, { recursive: true });
        console.log('Created cookies directory:', cookiesDir);
    } catch (err) {
        console.error('Failed to create cookies directory:', err);
    }
} else {
    console.log('Cookies directory already exists:', cookiesDir);
}


// Check if real downloads are enabled
const realDownloadsEnabled = fs.existsSync(path.join(__dirname, 'ENABLE_REAL_DOWNLOADS'));
console.log('Real downloads enabled:', realDownloadsEnabled);

// Download yt-dlp if it doesn't exist and real downloads are enabled
// === CORE DOWNLOAD FUNCTION (IMPROVED FOR RELIABILITY) ===
function downloadVideo(url, cookieFilename = null) {
    return new Promise((resolve, reject) => {
        // --- 0. Check if downloads are enabled ---
        if (!realDownloadsEnabled) {
            console.log('Real downloads not enabled, simulating');
            const timestamp = Date.now();
            const filename = `simulation_${timestamp}.txt`;
            const filePath = path.join(downloadsDir, filename);
            const content = `Download Simulation\nURL: ${url}\nTimestamp: ${new Date().toISOString()}\nReal downloads are disabled.`;
            fs.writeFileSync(filePath, content);
            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
            resolve({ success: true, title: 'Simulation File', downloadUrl, filename, simulated: true });
            return;
        }

        // --- 1. Ensure yt-dlp exists and is executable ---
        const ytDlpPath = path.join(__dirname, 'yt-dlp');
        if (!fs.existsSync(ytDlpPath)) {
            const errorMsg = 'yt-dlp executable not found. Cannot proceed with download.';
            console.error(errorMsg);
            const timestamp = Date.now();
            const filename = `error_noytdlp_${timestamp}.txt`;
            const filePath = path.join(downloadsDir, filename);
            fs.writeFileSync(filePath, errorMsg);
            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
            resolve({ success: true, title: 'yt-dlp Missing', downloadUrl, filename, error: true });
            return;
        }

        try {
            fs.accessSync(ytDlpPath, fs.constants.X_OK);
        } catch (accessError) {
            console.log('yt-dlp not executable, attempting fix...');
            try {
                fs.chmodSync(ytDlpPath, 0o755);
                console.log('yt-dlp permissions fixed.');
            } catch (chmodError) {
                const errorMsg = `Failed to make yt-dlp executable: ${chmodError.message}`;
                console.error(errorMsg);
                const timestamp = Date.now();
                const filename = `error_permissions_${timestamp}.txt`;
                const filePath = path.join(downloadsDir, filename);
                fs.writeFileSync(filePath, errorMsg);
                const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                resolve({ success: true, title: 'Permissions Error', downloadUrl, filename, error: true });
                return;
            }
        }

        // --- 2. Define a unique, predictable output filename ---
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        // Use a base name, avoiding special chars that might cause issues
        const baseOutputName = `download_${timestamp}_${randomSuffix}`;
        // Tell yt-dlp to save it as baseName.ext (e.g., download_12345_abc123.mp4)
        const outputPathTemplate = path.join(downloadsDir, `${baseOutputName}.%(ext)s`);

        console.log(`Starting real download for: ${url}`);
        console.log(`Output will be saved using template: ${outputPathTemplate}`);

        // --- 3. Build yt-dlp arguments ---
        let downloadOptions = [
            url,
            '--no-check-certificate',
            '--socket-timeout', '30',
            '--retries', '2',
            '--no-progress', // Cleaner output
            '-f', 'bv*[height<=?720]+ba/b', // Slightly better format selection for common use
            '-o', outputPathTemplate, // CRITICAL: Use our predictable template
            '--newline'
            // Removed --print for simplicity in this iteration, rely on template
        ];

        // Add cookies if provided
        if (cookieFilename) {
            const cookiePath = path.join(cookiesDir, cookieFilename);
            if (fs.existsSync(cookiePath)) {
                downloadOptions.push('--cookies', cookiePath);
                console.log('Using cookies for authentication');
            } else {
                console.log('Cookie file not found:', cookiePath);
            }
        }

        // --- 4. Spawn yt-dlp process ---
        const ytDlpProcess = spawn(ytDlpPath, downloadOptions);

        let stdoutData = '';
        let stderrData = '';

        ytDlpProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdoutData += chunk;
            console.log('[yt-dlp STDOUT]:', chunk.trim());
        });

        ytDlpProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderrData += chunk;
            // yt-dlp often uses stderr for info/warnings, not just errors
            console.log('[yt-dlp STDERR]:', chunk.trim());
        });

        ytDlpProcess.on('error', (err) => {
            console.error('[yt-dlp PROCESS ERROR]:', err);
            const timestamp = Date.now();
            const filename = `error_spawn_${timestamp}.txt`;
            const filePath = path.join(downloadsDir, filename);
            fs.writeFileSync(filePath, `Failed to start yt-dlp: ${err.message}\nURL: ${url}`);
            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
            reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        });

        // --- 5. Handle process completion ---
        ytDlpProcess.on('close', (code) => {
            console.log(`[yt-dlp PROCESS CLOSED] with code ${code}`);

            if (code === 0) {
                // --- SUCCESS PATH ---
                console.log("yt-dlp reported success (exit code 0). Looking for downloaded file...");

                // --- 6. FIND THE DOWNLOADED FILE using the base name ---
                // List files in the download directory
                fs.readdir(downloadsDir, (readErr, files) => {
                    if (readErr) {
                        console.error("Error reading downloads directory:", readErr);
                        reject(new Error(`Could not read downloads directory: ${readErr.message}`));
                        return;
                    }

                    // Filter files that start with our base name
                    const matchingFiles = files.filter(file =>
                        file.startsWith(baseOutputName) &&
                        file !== '.' && // Exclude current dir
                        file !== '..' // Exclude parent dir
                    );

                    console.log(`Found ${matchingFiles.length} file(s) matching base name '${baseOutputName}':`, matchingFiles);

                    if (matchingFiles.length === 1) {
                        // Perfect! One file matches.
                        const filename = matchingFiles[0];
                        const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                        const title = filename.replace(/\.[^/.]+$/, ""); // Remove extension for title
                        console.log(`✅ Successfully located downloaded file: ${filename}`);
                        resolve({ success: true, title, downloadUrl, filename });

                    } else if (matchingFiles.length > 1) {
                        // Multiple files? This is unusual for a single download. Pick the most likely one or newest.
                        console.warn("Multiple files matched base name. This is unexpected for a single download.");
                        // Sort by modification time descending (newest first)
                        const sortedMatches = matchingFiles.map(f => ({
                            file: f,
                            mtime: fs.statSync(path.join(downloadsDir, f)).mtime
                        })).sort((a, b) => b.mtime - a.mtime);

                        const filename = sortedMatches[0].file; // Pick newest
                        const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                        const title = filename.replace(/\.[^/.]+$/, "");
                        console.log(`✅ Picked newest file from multiple matches: ${filename}`);
                        resolve({ success: true, title, downloadUrl, filename });

                    } else {
                        // No file found matching our base name.
                        // This is the core issue we're trying to fix.
                        console.error(`❌ CRITICAL: yt-dlp reported success (code 0), but no file matching '${baseOutputName}*' was found in ${downloadsDir}`);
                        console.error("--- yt-dlp STDOUT ---");
                        console.error(stdoutData);
                        console.error("--- yt-dlp STDERR ---");
                        console.error(stderrData);
                        console.error("--- Files in directory ---");
                        console.error(files);

                        // Fallback: Check if ANY new file appeared recently (last 10 seconds)
                        const recentFiles = files
                            .filter(f => f !== '.' && f !== '..')
                            .map(f => ({ file: f, mtime: fs.statSync(path.join(downloadsDir, f)).mtime }))
                            .filter(item => (Date.now() - item.mtime.getTime()) < 10000) // Last 10 seconds
                            .sort((a, b) => b.mtime - a.mtime);

                        if (recentFiles.length > 0) {
                            const filename = recentFiles[0].file;
                            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                            const title = filename.replace(/\.[^/.]+$/, "");
                            console.warn(`⚠️ Fallback: Found a recently modified file: ${filename}`);
                            resolve({ success: true, title, downloadUrl, filename });
                        } else {
                            // Truly no file found
                            const timestamp = Date.now();
                            const filename = `error_nofile_${timestamp}.txt`;
                            const filePath = path.join(downloadsDir, filename);
                            const content = `Download process reported success, but the file could not be located.\n` +
                                            `Expected base name: ${baseOutputName}\n` +
                                            `URL: ${url}\n` +
                                            `Time: ${new Date().toISOString()}\n` +
                                            `--- yt-dlp Output ---\nSTDOUT:\n${stdoutData}\nSTDERR:\n${stderrData}`;
                            fs.writeFileSync(filePath, content);
                            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                            resolve({
                                success: true, // Resolve as success to indicate the process completed, error state handled
                                title: 'File Not Found',
                                downloadUrl,
                                filename,
                                error: true
                            });
                        }
                    }
                });

            } else {
                // --- ERROR PATH ---
                console.error(`[yt-dlp FAILED] with exit code ${code}`);
                console.error("--- yt-dlp STDOUT ---");
                console.error(stdoutData);
                console.error("--- yt-dlp STDERR ---");
                console.error(stderrData);

                const timestamp = Date.now();
                const filename = `error_code${code}_${timestamp}.txt`;
                const filePath = path.join(downloadsDir, filename);
                const content = `Download failed!\nURL: ${url}\nExit Code: ${code}\nTime: ${new Date().toISOString()}\n--- Output ---\nSTDOUT:\n${stdoutData}\nSTDERR:\n${stderrData}`;
                fs.writeFileSync(filePath, content);
                const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                resolve({
                    success: true, // Resolve as success, error state indicated in payload
                    title: 'Download Failed',
                    downloadUrl,
                    filename,
                    error: true
                });
            }
        });
    });
}






// Debug endpoint to list files
app.get('/api/downloads', (req, res) => {
    console.log('GET /api/downloads - Debugging endpoint');
    fs.readdir(downloadsDir, (err, files) => {
        if (err) {
            console.error('Error reading downloads dir:', err);
            return res.status(500).json({ error: 'Could not read downloads directory', details: err.message });
        }
        console.log('Files in downloads dir:', files);
        res.json({
            success: true,
            files: files,
            count: files.length,
            downloadsDir: downloadsDir
        });
    });
});

// --- Cookie Upload ---
app.post('/api/upload-cookie', upload.single('cookieFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No cookie file uploaded' });
    }
    console.log('Cookie file uploaded:', req.file.originalname);
    const newFilename = `cookies_${Date.now()}.txt`;
    const newPath = path.join(cookiesDir, newFilename);

    fs.rename(req.file.path, newPath, (err) => {
        if (err) {
            console.error('Error renaming cookie file:', err);
            return res.status(500).json({ error: 'Failed to process cookie file' });
        }
        res.json({
            success: true,
            message: 'Cookie file uploaded successfully',
            filename: newFilename,
            path: newPath
        });
    });
});

// --- CORE DOWNLOAD LOGIC ---
// Improved download function that captures the actual filename from yt-dlp output
function downloadVideo(url, cookieFilename = null) {
    return new Promise((resolve, reject) => {
        if (!realDownloadsEnabled) {
            console.log('Real downloads not enabled, simulating');
            const timestamp = Date.now();
            const filename = `video_simulation_${timestamp}.txt`;
            const filePath = path.join(downloadsDir, filename);

            const content = `Simulation File\nURL: ${url}\nTimestamp: ${new Date().toISOString()}\nReal downloads are disabled.`;
            fs.writeFileSync(filePath, content);

            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
            resolve({
                success: true,
                title: 'Simulation File',
                downloadUrl: downloadUrl,
                filename: filename,
                simulated: true
            });
            return;
        }

        const ytDlpPath = path.join(__dirname, 'yt-dlp');

        if (!fs.existsSync(ytDlpPath)) {
            console.log('yt-dlp not found, simulating download error');
            const timestamp = Date.now();
            const filename = `error_ytdlp_missing_${timestamp}.txt`;
            const filePath = path.join(downloadsDir, filename);

            const content = `Error: yt-dlp executable not found.`;
            fs.writeFileSync(filePath, content);

            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
            resolve({
                success: true, // Still "successful" in that we handled the error state
                title: 'yt-dlp Missing',
                downloadUrl: downloadUrl,
                filename: filename,
                error: true
            });
            return;
        }

        try {
            fs.accessSync(ytDlpPath, fs.constants.X_OK);
        } catch (accessError) {
            console.log('yt-dlp not executable, attempting fix');
            try {
                fs.chmodSync(ytDlpPath, 0o755);
            } catch (chmodError) {
                console.error('Failed to fix yt-dlp permissions:', chmodError);
                const timestamp = Date.now();
                const filename = `error_permissions_${timestamp}.txt`;
                const filePath = path.join(downloadsDir, filename);
                fs.writeFileSync(filePath, `Error: Could not make yt-dlp executable. ${chmodError.message}`);
                const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                resolve({ success: true, title: 'Permissions Error', downloadUrl, filename, error: true });
                return;
            }
        }

        console.log('Starting real download for:', url);

        // --- CRITICAL CHANGE ---
        // Use --print-to-file to capture the final filename
        // Use a temporary file to store the filename output
        const tempFilename = `yt_output_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.tmp`;
        const tempFilePath = path.join(downloadsDir, tempFilename);

        // Build download options
        // Use %(filename)s.%(ext)s to get the base filename from yt-dlp
        // Use --newline for cleaner output parsing if needed
        // Use --print "%(filepath)s" to print the final file path to stdout
        let downloadOptions = [
            url,
            '--no-check-certificate',
            '--socket-timeout', '30',
            '--retries', '2',
            '--print', '%(filepath)s', // This is the key: Print the full path of the downloaded file
            '-f', 'bv*+ba/b', // Better format selection
            '-o', path.join(downloadsDir, '%(title)s.%(ext)s'), // Output template
            '--newline'
        ];

        if (cookieFilename) {
            const cookiePath = path.join(cookiesDir, cookieFilename);
            if (fs.existsSync(cookiePath)) {
                downloadOptions.push('--cookies', cookiePath);
                console.log('Using cookies for authentication');
            } else {
                console.log('Cookie file not found:', cookiePath);
            }
        }

        const ytDlpProcess = spawn(ytDlpPath, downloadOptions);

        let outputBuffer = '';
        let errorBuffer = '';
        let capturedFilePath = null; // Variable to hold the captured file path

        ytDlpProcess.on('error', (err) => {
            console.error('yt-dlp process error:', err);
            cleanupTempFile(tempFilePath);
            reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        });

        // Capture stdout to get the printed filepath
        ytDlpProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            outputBuffer += chunk;
            console.log('yt-dlp stdout:', chunk.trim());
        });

        // Capture stderr for errors/logs
        ytDlpProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            errorBuffer += chunk;
            console.log('yt-dlp stderr:', chunk.trim());
        });

        ytDlpProcess.on('close', (code) => {
            console.log(`yt-dlp process exited with code ${code}`);

            // Attempt cleanup of temp file even if not used
            cleanupTempFile(tempFilePath);

            if (code === 0) {
                // Parse the output buffer to find the file path
                // yt-dlp with --print will output the path on a line by itself
                const lines = outputBuffer.trim().split('\n');
                // The last non-empty line should be the filepath printed by --print
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    if (line && fs.existsSync(line) && path.dirname(line) === downloadsDir) {
                         capturedFilePath = line;
                         break;
                    }
                }

                if (capturedFilePath) {
                    const filename = path.basename(capturedFilePath);
                    const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                    const title = filename.replace(/\.[^/.]+$/, "");
                    console.log(`Successfully downloaded and located file: ${filename}`);
                    resolve({
                        success: true,
                        title: title,
                        downloadUrl: downloadUrl,
                        filename: filename
                    });
                } else {
                    console.error('Could not determine downloaded file path from yt-dlp output.');
                    console.error('Stdout Buffer:', outputBuffer);
                    console.error('Stderr Buffer:', errorBuffer);
                    // Fallback: list recent files
                    fs.readdir(downloadsDir, (readErr, files) => {
                        if (readErr) {
                            console.error('Failed to read downloads dir for fallback:', readErr);
                            reject(new Error('Download succeeded but could not locate file. Failed to read directory for fallback.'));
                        } else {
                            const recentFiles = files
                                .map(f => ({ file: f, mtime: fs.statSync(path.join(downloadsDir, f)).mtime }))
                                .sort((a, b) => b.mtime - a.mtime);
                            if (recentFiles.length > 0) {
                                const filename = recentFiles[0].file;
                                const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                                const title = filename.replace(/\.[^/.]+$/, "");
                                console.warn(`Used fallback to locate file: ${filename}`);
                                resolve({ success: true, title, downloadUrl, filename });
                            } else {
                                reject(new Error('Download succeeded but no file found in directory.'));
                            }
                        }
                    });
                }
            } else {
                console.error('yt-dlp process failed with code:', code);
                console.error('Error output:', errorBuffer);
                const timestamp = Date.now();
                const filename = `download_error_${timestamp}.txt`;
                const filePath = path.join(downloadsDir, filename);
                const content = `Download Failed!\nURL: ${url}\nExit Code: ${code}\nError Output:\n${errorBuffer || 'Unknown error'}\nTime: ${new Date().toISOString()}`;
                fs.writeFileSync(filePath, content);
                const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                resolve({
                    success: true, // Resolve successfully, but indicate error in payload
                    title: 'Download Failed',
                    downloadUrl: downloadUrl,
                    filename: filename,
                    error: true
                });
            }
        });
    });
}

// Helper to clean up temp files
function cleanupTempFile(tempPath) {
    if (fs.existsSync(tempPath)) {
        try {
            fs.unlinkSync(tempPath);
            console.log('Cleaned up temporary file:', tempPath);
        } catch (unlinkErr) {
            console.warn('Could not clean up temporary file:', tempPath, unlinkErr.message);
        }
    }
}

// --- Specific Download Endpoints ---
// Generic download endpoint
app.post('/api/download', async (req, res) => {
    const { url, cookieFile } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log('POST /api/download - URL:', url);
    try {
        const result = await downloadVideo(url, cookieFile);
        res.json(result);
    } catch (error) {
        console.error('Generic download error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Platform-specific endpoints (they just delegate to the generic one now)
app.post('/api/download/youtube', async (req, res) => {
    const { url, cookieFile } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log('POST /api/download/youtube - URL:', url);
    try {
        const result = await downloadVideo(url, cookieFile);
        res.json(result);
    } catch (error) {
        console.error('YouTube download error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/download/instagram', async (req, res) => {
    const { url, cookieFile } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log('POST /api/download/instagram - URL:', url);
    try {
        const result = await downloadVideo(url, cookieFile);
        res.json(result);
    } catch (error) {
        console.error('Instagram download error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/download/tiktok', async (req, res) => {
    const { url, cookieFile } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log('POST /api/download/tiktok - URL:', url);
    try {
        const result = await downloadVideo(url, cookieFile);
        res.json(result);
    } catch (error) {
        console.error('TikTok download error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/download/twitter', async (req, res) => {
    const { url, cookieFile } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log('POST /api/download/twitter - URL:', url);
    try {
        const result = await downloadVideo(url, cookieFile);
        res.json(result);
    } catch (error) {
        console.error('Twitter download error:', error);
        res.status(500).json({ error: error.message });
    }
});


// --- Batch Download Endpoint ---
app.post('/api/download/batch', async (req, res) => {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'URLs array is required' });
    }
    console.log('Batch download requested for', urls.length, 'videos');

    // Respond immediately
    res.json({
        success: true,
        message: `Batch download started for ${urls.length} videos`,
        total: urls.length
    });

    // Process asynchronously
    (async () => {
        console.log('Starting asynchronous batch download for', urls.length, 'videos');
        // Consider using a proper queue/job system for production
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`Processing batch video ${i + 1}/${urls.length}:`, url);
            try {
                // Simple delay between downloads
                if (i > 0) await new Promise(r => setTimeout(r, 2000));
                await downloadVideo(url, null);
                console.log(`Completed batch video ${i + 1}`);
            } catch (error) {
                console.error(`Error processing batch video ${i + 1}:`, url, error);
            }
        }
        console.log('Asynchronous batch download processing completed');
    })().catch(err => {
        console.error("Unexpected error in batch processing background task:", err);
    });
});

// --- Serve Main Pages ---
// CRITICAL: Ensure only ONE root handler
app.get('/', (req, res) => {
    console.log('GET / - Serving main page');
    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log('Attempting to serve index.html from:', indexPath);
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            if (!res.headersSent) {
                if (err.code === 'ENOENT') {
                    res.status(404).json({ error: 'Main page (index.html) not found on server' });
                } else {
                    res.status(500).json({ error: 'Failed to load main page', details: err.message });
                }
            }
        }
    });
});

app.get('/batch.html', (req, res) => {
    console.log('GET /batch.html');
    const batchPath = path.join(__dirname, 'public', 'batch.html');
    res.sendFile(batchPath, (err) => {
        if (err) {
            console.error('Error sending batch.html:', err);
            if (!res.headersSent) {
                if (err.code === 'ENOENT') {
                    res.status(404).json({ error: 'Batch page (batch.html) not found on server' });
                } else {
                    res.status(500).json({ error: 'Failed to load batch page', details: err.message });
                }
            }
        }
    });
});

// --- Error Handling ---
// Catch-all for unmatched routes (must be AFTER all defined routes)
app.use((req, res) => {
    console.log(`404 - Unmatched route: ${req.method} ${req.path}`);
    res.status(404).json({
        error: 'Route not found',
        path: req.path,
        method: req.method
    });
});

// Global error handler (must be LAST middleware)
app.use((err, req, res, next) => { // next param is REQUIRED for Express to recognize it as error handler
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', message: err.message });
    } else {
        console.error("Error occurred after headers sent, cannot send error response:", err);
    }
});

// --- Start Server ---
// CRITICAL: Bind to 0.0.0.0 as required by Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('Public files served from:', path.join(__dirname, 'public'));
    console.log('Downloads served from:', downloadsDir);
    console.log('Cookies stored in:', cookiesDir);
    console.log('Real downloads enabled:', realDownloadsEnabled);
});

console.log('=== SERVER SETUP COMPLETE ===');