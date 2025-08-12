const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');

console.log('=== SERVER STARTING ===');
const app = express();
const PORT = process.env.PORT || 3000;

// Global variables
let ytDlpPath = null;
let isInitializing = false;

// Middleware with proper error handling
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve downloaded videos with proper headers
app.use('/downloads', (req, res, next) => {
    res.setHeader('Content-Disposition', 'attachment');
    next();
}, express.static(path.join(__dirname, 'downloads')));

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
try {
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
        console.log('Created downloads directory');
    }
} catch (error) {
    console.error('Failed to create downloads directory:', error);
}

// Utility function to check if yt-dlp is available
function checkYtDlpAvailability() {
    const possiblePaths = [
        path.join(__dirname, 'yt-dlp'),
        path.join(__dirname, 'yt-dlp.exe'),
        'yt-dlp' // System PATH
    ];
    
    for (const testPath of possiblePaths) {
        try {
            if (testPath.includes(__dirname) && fs.existsSync(testPath)) {
                return testPath;
            }
            // For system PATH, we'll test it when needed
            if (!testPath.includes(__dirname)) {
                return testPath;
            }
        } catch (error) {
            continue;
        }
    }
    return null;
}

// Download yt-dlp if it doesn't exist
async function ensureYtDlp() {
    if (ytDlpPath && fs.existsSync(ytDlpPath)) {
        return ytDlpPath;
    }
    
    if (isInitializing) {
        // Wait for initialization to complete
        return new Promise((resolve, reject) => {
            const checkInit = setInterval(() => {
                if (!isInitializing) {
                    clearInterval(checkInit);
                    if (ytDlpPath) {
                        resolve(ytDlpPath);
                    } else {
                        reject(new Error('yt-dlp initialization failed'));
                    }
                }
            }, 500);
            
            // Timeout after 30 seconds
            setTimeout(() => {
                clearInterval(checkInit);
                reject(new Error('yt-dlp initialization timeout'));
            }, 30000);
        });
    }
    
    isInitializing = true;
    
    try {
        // First check if yt-dlp is available in system PATH
        const systemYtDlp = await testSystemYtDlp();
        if (systemYtDlp) {
            ytDlpPath = 'yt-dlp';
            isInitializing = false;
            console.log('Using system yt-dlp');
            return ytDlpPath;
        }
        
        // Download yt-dlp
        const localPath = path.join(__dirname, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
        
        console.log('Downloading yt-dlp to:', localPath);
        
        const downloadUrl = process.platform === 'win32' 
            ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
            : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
        
        await downloadFile(downloadUrl, localPath);
        
        // Make executable on Unix systems
        if (process.platform !== 'win32') {
            fs.chmodSync(localPath, 0o755);
        }
        
        ytDlpPath = localPath;
        isInitializing = false;
        console.log('yt-dlp downloaded successfully to:', localPath);
        return ytDlpPath;
        
    } catch (error) {
        isInitializing = false;
        console.error('Failed to ensure yt-dlp:', error);
        throw new Error(`yt-dlp setup failed: ${error.message}`);
    }
}

// Test if system yt-dlp is available
function testSystemYtDlp() {
    return new Promise((resolve) => {
        const testProcess = spawn('yt-dlp', ['--version'], { 
            stdio: 'pipe',
            timeout: 5000 
        });
        
        testProcess.on('close', (code) => {
            resolve(code === 0);
        });
        
        testProcess.on('error', () => {
            resolve(false);
        });
        
        // Timeout fallback
        setTimeout(() => {
            testProcess.kill();
            resolve(false);
        }, 5000);
    });
}

// Download file utility
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        let receivedBytes = 0;
        
        const request = https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirect
                file.close();
                fs.unlinkSync(dest);
                return downloadFile(response.headers.location, dest)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dest);
                reject(new Error(`Download failed: ${response.statusCode} ${response.statusMessage}`));
                return;
            }
            
            const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
            
            response.on('data', (chunk) => {
                receivedBytes += chunk.length;
                if (totalBytes > 0) {
                    const progress = ((receivedBytes / totalBytes) * 100).toFixed(1);
                    process.stdout.write(`\rDownloading yt-dlp: ${progress}%`);
                }
            });
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log('\nDownload completed');
                resolve();
            });
            
            file.on('error', (err) => {
                file.close();
                fs.unlinkSync(dest);
                reject(err);
            });
        });
        
        request.on('error', (err) => {
            file.close();
            fs.unlinkSync(dest);
            reject(err);
        });
        
        request.setTimeout(60000, () => {
            request.destroy();
            file.close();
            fs.unlinkSync(dest);
            reject(new Error('Download timeout'));
        });
    });
}

// Get video info without downloading
async function getVideoInfo(url) {
    try {
        const ytDlpPath = await ensureYtDlp();
        
        console.log('Getting video info for:', url);
        
        return new Promise((resolve, reject) => {
            const args = [
                url,
                '--dump-json',
                '--no-warnings',
                '--no-check-certificate',
                '--socket-timeout', '30'
            ];
            
            console.log('Running:', ytDlpPath, args.join(' '));
            
            const ytDlpProcess = spawn(ytDlpPath, args, {
                timeout: 30000,
                killSignal: 'SIGKILL'
            });
            
            let output = '';
            let errorOutput = '';
            
            ytDlpProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ytDlpProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            ytDlpProcess.on('close', (code, signal) => {
                if (signal) {
                    reject(new Error(`Process killed by signal: ${signal}`));
                    return;
                }
                
                if (code === 0 && output.trim()) {
                    try {
                        const lines = output.trim().split('\n');
                        const jsonLine = lines.find(line => line.startsWith('{'));
                        
                        if (!jsonLine) {
                            reject(new Error('No valid JSON found in output'));
                            return;
                        }
                        
                        const videoInfo = JSON.parse(jsonLine);
                        resolve({
                            title: videoInfo.title || 'Unknown Title',
                            duration: videoInfo.duration || 0,
                            uploader: videoInfo.uploader || 'Unknown',
                            thumbnail: videoInfo.thumbnail || null,
                            formats: videoInfo.formats?.length || 0
                        });
                    } catch (parseError) {
                        console.error('Parse error:', parseError);
                        console.error('Raw output:', output);
                        reject(new Error('Failed to parse video info'));
                    }
                } else {
                    const errorMsg = errorOutput.trim() || 'Unknown error';
                    reject(new Error(`Failed to get video info (code ${code}): ${errorMsg}`));
                }
            });
            
            ytDlpProcess.on('error', (err) => {
                reject(new Error(`Process error: ${err.message}`));
            });
        });
        
    } catch (error) {
        throw new Error(`Video info failed: ${error.message}`);
    }
}

// Enhanced download function with better error handling
async function downloadVideo(url, options = {}) {
    try {
        const ytDlpExecutable = await ensureYtDlp();
        
        console.log('Starting download for:', url);
        
        return new Promise((resolve, reject) => {
            // Build yt-dlp arguments
            const args = [
                url,
                '--newline',
                '--no-check-certificate',
                '--no-warnings',
                '--socket-timeout', '30',
                '--retries', '3'
            ];
            
            // Quality selection
            if (options.quality === 'best') {
                args.push('-f', 'best[ext=mp4]/best');
            } else if (options.quality === 'audio') {
                args.push('-f', 'bestaudio[ext=m4a]/bestaudio');
            } else {
                args.push('-f', 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b');
            }
            
            // Output template with safe filename
            const outputTemplate = path.join(downloadsDir, '%(title).100s.%(ext)s');
            args.push('-o', outputTemplate);
            
            // Additional options
            if (options.extractAudio) {
                args.push('--extract-audio', '--audio-format', 'mp3');
            }
            
            if (options.writeSubtitles) {
                args.push('--write-subs', '--sub-lang', 'en');
            }
            
            console.log('yt-dlp command:', ytDlpExecutable, args.join(' '));
            
            const ytDlpProcess = spawn(ytDlpExecutable, args, {
                timeout: 300000, // 5 minutes timeout
                killSignal: 'SIGKILL'
            });
            
            let output = '';
            let errorOutput = '';
            let downloadProgress = 0;
            
            ytDlpProcess.on('error', (err) => {
                console.error('yt-dlp process error:', err);
                reject(new Error(`Failed to start yt-dlp: ${err.message}`));
            });
            
            ytDlpProcess.stdout.on('data', (data) => {
                const dataStr = data.toString();
                output += dataStr;
                
                // Parse download progress
                const progressMatch = dataStr.match(/(\d+\.?\d*)%/);
                if (progressMatch) {
                    downloadProgress = parseFloat(progressMatch[1]);
                    console.log(`Download progress: ${downloadProgress}%`);
                }
            });
            
            ytDlpProcess.stderr.on('data', (data) => {
                const dataStr = data.toString();
                errorOutput += dataStr;
                console.error('yt-dlp stderr:', dataStr.trim());
            });
            
            ytDlpProcess.on('close', (code, signal) => {
                if (signal) {
                    reject(new Error(`Download process killed by signal: ${signal}`));
                    return;
                }
                
                console.log(`yt-dlp process exited with code ${code}`);
                
                if (code === 0) {
                    // Success - find the downloaded file
                    try {
                        const files = fs.readdirSync(downloadsDir)
                            .filter(file => !file.startsWith('.') && !file.endsWith('.part'));
                        
                        if (files.length > 0) {
                            // Get the most recent file
                            const recentFiles = files
                                .map(file => {
                                    const filePath = path.join(downloadsDir, file);
                                    const stats = fs.statSync(filePath);
                                    return { 
                                        file, 
                                        mtime: stats.mtime,
                                        size: stats.size
                                    };
                                })
                                .sort((a, b) => b.mtime - a.mtime);
                            
                            const recentFile = recentFiles[0];
                            const downloadUrl = `/downloads/${encodeURIComponent(recentFile.file)}`;
                            
                            resolve({
                                success: true,
                                title: recentFile.file.replace(/\.[^/.]+$/, ""),
                                downloadUrl: downloadUrl,
                                filename: recentFile.file,
                                fileSize: recentFile.size,
                                progress: 100
                            });
                        } else {
                            reject(new Error('No files found after download'));
                        }
                    } catch (fileError) {
                        reject(new Error(`Could not read downloads directory: ${fileError.message}`));
                    }
                } else {
                    // Handle specific error codes
                    let errorMessage = `Download failed with code ${code}`;
                    
                    if (errorOutput.includes('Video unavailable')) {
                        errorMessage = 'Video is unavailable or has been removed';
                    } else if (errorOutput.includes('Private video')) {
                        errorMessage = 'Video is private and cannot be downloaded';
                    } else if (errorOutput.includes('Sign in to confirm your age')) {
                        errorMessage = 'Video requires age verification';
                    } else if (errorOutput.includes('This video is not available')) {
                        errorMessage = 'Video is not available in your region';
                    } else if (errorOutput.includes('Unsupported URL')) {
                        errorMessage = 'Unsupported URL or platform';
                    } else if (errorOutput.trim()) {
                        errorMessage += `: ${errorOutput.trim().split('\n')[0]}`;
                    }
                    
                    reject(new Error(errorMessage));
                }
            });
        });
        
    } catch (error) {
        throw new Error(`Download setup failed: ${error.message}`);
    }
}

// API Routes with proper error handling
app.get('/api/platforms', (req, res) => {
    try {
        console.log('GET /api/platforms');
        res.json({
            platforms: [
                { name: 'YouTube', key: 'youtube', icon: '📺' },
                { name: 'Instagram', key: 'instagram', icon: '📱' },
                { name: 'TikTok', key: 'tiktok', icon: '🎵' },
                { name: 'Twitter/X', key: 'twitter', icon: '🐦' },
                { name: 'Facebook', key: 'facebook', icon: '📘' },
                { name: 'Vimeo', key: 'vimeo', icon: '🎬' },
                { name: 'Other Platforms', key: 'generic', icon: '🔗' }
            ]
        });
    } catch (error) {
        console.error('Platforms error:', error);
        res.status(500).json({ error: 'Failed to get platforms' });
    }
});

app.get('/health', async (req, res) => {
    try {
        console.log('GET /health');
        const hasYtDlp = ytDlpPath ? true : checkYtDlpAvailability() !== null;
        
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            ytdlp: hasYtDlp,
            ytdlpPath: ytDlpPath || 'not initialized',
            downloadsDir: fs.existsSync(downloadsDir)
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ error: 'Health check failed' });
    }
});

// Video info endpoint
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        console.log('POST /api/info - URL:', url);
        
        const info = await getVideoInfo(url);
        res.json(info);
    } catch (error) {
        console.error('Video info error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// Generic download handler
async function handleDownload(req, res, platform = 'generic') {
    try {
        const { url, quality = 'best', extractAudio = false, writeSubtitles = false } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        console.log(`POST /api/download/${platform} - URL:`, url, 'Quality:', quality);
        
        const result = await downloadVideo(url, { quality, extractAudio, writeSubtitles });
        res.json(result);
    } catch (error) {
        console.error(`${platform} download error:`, error);
        res.status(500).json({ 
            error: error.message,
            platform: platform
        });
    }
}

// Download endpoints
app.post('/api/download/youtube', (req, res) => handleDownload(req, res, 'youtube'));
app.post('/api/download/instagram', (req, res) => handleDownload(req, res, 'instagram'));
app.post('/api/download/tiktok', (req, res) => handleDownload(req, res, 'tiktok'));
app.post('/api/download/twitter', (req, res) => handleDownload(req, res, 'twitter'));
app.post('/api/download/facebook', (req, res) => handleDownload(req, res, 'facebook'));
app.post('/api/download/vimeo', (req, res) => handleDownload(req, res, 'vimeo'));
app.post('/api/download', (req, res) => handleDownload(req, res, 'generic'));

// Batch download endpoint
app.post('/api/download/batch', async (req, res) => {
    try {
        const { urls, quality = 'best' } = req.body;
        
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: 'URLs array is required' });
        }
        
        if (urls.length > 10) {
            return res.status(400).json({ error: 'Maximum 10 URLs allowed per batch' });
        }
        
        console.log('POST /api/download/batch - URLs:', urls.length);
        
        const results = [];
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            try {
                console.log(`Processing ${i + 1}/${urls.length}: ${url}`);
                const result = await downloadVideo(url, { quality });
                results.push({ url, ...result });
            } catch (error) {
                console.error(`Batch download error for ${url}:`, error);
                results.push({ 
                    url, 
                    success: false, 
                    error: error.message 
                });
            }
        }
        
        res.json({ 
            success: true, 
            results,
            total: urls.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        });
    } catch (error) {
        console.error('Batch download error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List downloaded files
app.get('/api/downloads', (req, res) => {
    try {
        const files = fs.readdirSync(downloadsDir)
            .filter(file => !file.startsWith('.') && !file.endsWith('.part'))
            .map(file => {
                const filePath = path.join(downloadsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    size: stats.size,
                    created: stats.birthtime,
                    downloadUrl: `/downloads/${encodeURIComponent(file)}`
                };
            })
            .sort((a, b) => b.created - a.created);
        
        res.json({ files });
    } catch (error) {
        console.error('List downloads error:', error);
        res.status(500).json({ error: 'Failed to list downloads' });
    }
});

// Delete downloaded file
app.delete('/api/downloads/:filename', (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const filePath = path.join(downloadsDir, filename);
        
        // Security check - ensure file is in downloads directory
        if (!filePath.startsWith(downloadsDir)) {
            return res.status(400).json({ error: 'Invalid filename' });
        }
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true, message: 'File deleted' });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// Serve main pages
app.get('/', (req, res) => {
    try {
        console.log('GET / - Serving main page');
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } catch (error) {
        console.error('Serve index error:', error);
        res.status(500).json({ error: 'Failed to serve page' });
    }
});

app.get('/batch.html', (req, res) => {
    try {
        console.log('GET /batch.html');
        res.sendFile(path.join(__dirname, 'public', 'batch.html'));
    } catch (error) {
        console.error('Serve batch page error:', error);
        res.status(500).json({ error: 'Failed to serve page' });
    }
});

// Catch all 404s
app.use('*', (req, res) => {
    console.log('404 for:', req.path);
    res.status(404).json({ 
        error: 'Not found',
        path: req.path
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Initialize yt-dlp on startup (non-blocking)
console.log('Initializing yt-dlp...');
ensureYtDlp()
    .then((path) => {
        console.log('✅ yt-dlp ready at:', path);
    })
    .catch((error) => {
        console.error('❌ Failed to initialize yt-dlp:', error.message);
        console.log('Server will continue running with limited functionality');
    });

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Downloads directory: ${downloadsDir}`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
});

console.log('=== SERVER SETUP COMPLETE ===');