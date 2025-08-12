const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

console.log('=== SERVER STARTING ===');
const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve downloaded videos
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
try {
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
        console.log('✅ Created downloads directory');
    }
} catch (error) {
    console.error('❌ Failed to create downloads directory:', error);
}

// Simple download function with fallback
function downloadVideo(url) {
    return new Promise((resolve, reject) => {
        console.log('🎬 Starting download for:', url);
        
        // Check for yt-dlp executable
        const possiblePaths = [
            'yt-dlp',
            './yt-dlp',
            path.join(__dirname, 'yt-dlp'),
            path.join(__dirname, 'yt-dlp.exe')
        ];
        
        let ytDlpPath = null;
        
        // Find available yt-dlp
        for (const testPath of possiblePaths) {
            try {
                if (testPath.startsWith('./') || testPath.includes(__dirname)) {
                    if (fs.existsSync(testPath)) {
                        ytDlpPath = testPath;
                        break;
                    }
                } else {
                    // For system PATH, we'll test it
                    ytDlpPath = testPath;
                    break;
                }
            } catch (err) {
                continue;
            }
        }
        
        if (!ytDlpPath) {
            console.log('⚠️ yt-dlp not found, creating dummy file for testing');
            // Create dummy file for testing
            const timestamp = Date.now();
            const filename = `test-video-${timestamp}.txt`;
            const filePath = path.join(downloadsDir, filename);
            const content = `Test Download\nURL: ${url}\nTime: ${new Date().toISOString()}\n\nNote: Install yt-dlp for real downloads`;
            
            try {
                fs.writeFileSync(filePath, content);
                resolve({
                    success: true,
                    title: `Test Video ${timestamp}`,
                    downloadUrl: `/downloads/${filename}`,
                    filename: filename,
                    fileSize: content.length
                });
            } catch (writeError) {
                reject(new Error(`Failed to create test file: ${writeError.message}`));
            }
            return;
        }
        
        console.log('🔧 Using yt-dlp at:', ytDlpPath);
        
        // Real yt-dlp download
        const outputPath = path.join(downloadsDir, '%(title)s.%(ext)s');
        const args = [
            url,
            '-f', 'best[height<=720]/best',
            '-o', outputPath,
            '--no-warnings'
        ];
        
        console.log('🚀 Command:', ytDlpPath, args.join(' '));
        
        const process = spawn(ytDlpPath, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        process.stdout.on('data', (data) => {
            const str = data.toString();
            output += str;
            console.log('📥 Output:', str.trim());
        });
        
        process.stderr.on('data', (data) => {
            const str = data.toString();
            errorOutput += str;
            console.log('⚠️ Error:', str.trim());
        });
        
        process.on('close', (code) => {
            console.log(`🏁 Process finished with code: ${code}`);
            
            if (code === 0) {
                // Find downloaded file
                try {
                    const files = fs.readdirSync(downloadsDir)
                        .filter(f => !f.startsWith('.'))
                        .map(f => ({
                            name: f,
                            time: fs.statSync(path.join(downloadsDir, f)).mtime
                        }))
                        .sort((a, b) => b.time - a.time);
                    
                    if (files.length > 0) {
                        const file = files[0];
                        resolve({
                            success: true,
                            title: file.name.replace(/\.[^/.]+$/, ''),
                            downloadUrl: `/downloads/${encodeURIComponent(file.name)}`,
                            filename: file.name,
                            fileSize: fs.statSync(path.join(downloadsDir, file.name)).size
                        });
                    } else {
                        reject(new Error('No files found after download'));
                    }
                } catch (err) {
                    reject(new Error(`File check failed: ${err.message}`));
                }
            } else {
                reject(new Error(`Download failed: ${errorOutput || 'Unknown error'}`));
            }
        });
        
        process.on('error', (err) => {
            console.error('❌ Process error:', err);
            reject(new Error(`Process failed: ${err.message}`));
        });
        
        // Timeout after 2 minutes
        setTimeout(() => {
            try {
                process.kill('SIGKILL');
                reject(new Error('Download timeout'));
            } catch (killErr) {
                reject(new Error('Download timeout and kill failed'));
            }
        }, 120000);
    });
}

// API Routes
app.get('/api/platforms', (req, res) => {
    console.log('📋 GET /api/platforms');
    try {
        res.json({
            platforms: [
                { name: 'YouTube', key: 'youtube', icon: '📺' },
                { name: 'Instagram', key: 'instagram', icon: '📱' },
                { name: 'TikTok', key: 'tiktok', icon: '🎵' },
                { name: 'Twitter/X', key: 'twitter', icon: '🐦' },
                { name: 'Other Platforms', key: 'generic', icon: '🔗' }
            ]
        });
    } catch (error) {
        console.error('❌ Platforms error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    console.log('🏥 GET /health');
    try {
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            downloadsDir: fs.existsSync(downloadsDir)
        });
    } catch (error) {
        console.error('❌ Health error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download endpoints
app.post('/api/download/youtube', async (req, res) => {
    console.log('🎬 POST /api/download/youtube');
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        console.log('📹 YouTube URL:', url);
        const result = await downloadVideo(url);
        res.json(result);
    } catch (error) {
        console.error('❌ YouTube error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/download/instagram', async (req, res) => {
    console.log('📱 POST /api/download/instagram');
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        console.log('📸 Instagram URL:', url);
        const result = await downloadVideo(url);
        res.json(result);
    } catch (error) {
        console.error('❌ Instagram error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/download/tiktok', async (req, res) => {
    console.log('🎵 POST /api/download/tiktok');
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        console.log('🎤 TikTok URL:', url);
        const result = await downloadVideo(url);
        res.json(result);
    } catch (error) {
        console.error('❌ TikTok error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/download/twitter', async (req, res) => {
    console.log('🐦 POST /api/download/twitter');
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        console.log('🐦 Twitter URL:', url);
        const result = await downloadVideo(url);
        res.json(result);
    } catch (error) {
        console.error('❌ Twitter error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/download', async (req, res) => {
    console.log('🔗 POST /api/download');
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        console.log('🌐 Generic URL:', url);
        const result = await downloadVideo(url);
        res.json(result);
    } catch (error) {
        console.error('❌ Generic download error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List downloads
app.get('/api/downloads', (req, res) => {
    console.log('📂 GET /api/downloads');
    try {
        const files = fs.readdirSync(downloadsDir)
            .filter(file => !file.startsWith('.'))
            .map(file => {
                const stats = fs.statSync(path.join(downloadsDir, file));
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
        console.error('❌ List error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete file
app.delete('/api/downloads/:filename', (req, res) => {
    console.log('🗑️ DELETE /api/downloads');
    try {
        const filename = decodeURIComponent(req.params.filename);
        const filePath = path.join(downloadsDir, filename);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true, message: 'File deleted' });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('❌ Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve pages
app.get('/', (req, res) => {
    console.log('🏠 GET /');
    try {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } catch (error) {
        console.error('❌ Index error:', error);
        res.status(500).send('Error loading page');
    }
});

app.get('/batch.html', (req, res) => {
    console.log('📦 GET /batch.html');
    try {
        res.sendFile(path.join(__dirname, 'public', 'batch.html'));
    } catch (error) {
        console.error('❌ Batch page error:', error);
        res.status(500).send('Error loading page');
    }
});

// 404 handler
app.use('*', (req, res) => {
    console.log('❓ 404 for:', req.path);
    res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('💥 Unhandled error:', err);
    res.status(500).json({ 
        error: 'Server error', 
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Server running on port', PORT);
    console.log('📁 Downloads directory:', downloadsDir);
    console.log('🌐 Visit: http://localhost:' + PORT);
});

console.log('=== SERVER READY ===');