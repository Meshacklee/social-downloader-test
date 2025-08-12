const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// API Routes
app.get('/api/platforms', (req, res) => {
    console.log('GET /api/platforms');
    res.json({
        platforms: [
            { name: 'YouTube', icon: '📺' },
            { name: 'Test', icon: '✅' }
        ]
    });
});

app.get('/health', (req, res) => {
    console.log('GET /health');
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString()
    });
});

// Serve main page
app.get('/', (req, res) => {
    console.log('GET /');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch all 404s
app.use('*', (req, res) => {
    console.log('404 for:', req.path);
    res.status(404).json({ 
        error: 'Not found',
        path: req.path
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('Test URLs:');
    console.log(`  http://localhost:${PORT}/`);
    console.log(`  http://localhost:${PORT}/api/platforms`);
    console.log(`  http://localhost:${PORT}/health`);
});