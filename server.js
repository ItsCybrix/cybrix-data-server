// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5055;
const db = require('./custom_modules/sql/db_connector');

// --------------------
// Body parser with large limits
// --------------------
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// --------------------
// Setup upload directory
// --------------------
let UPLOADS_DIR;

if (process.env.ENVIRONMENT === 'DEV') {
    UPLOADS_DIR = path.join(__dirname, 'uploads');
    console.log("DEV environment: using local uploads folder.");
} else if (process.env.ENVIRONMENT === 'PROD') {
    UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
    console.log("PROD environment: using uploads folder from .env");
} else {
    console.error("ENVIRONMENT variable not set correctly!");
    process.exit(1);
}

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --------------------
// Multer config
// --------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
});

// --------------------
// Routes
// --------------------


// --------------------
// Upload endpoint
// --------------------
app.post('/upload', upload.single('file'), (req, res) => {
    const { session_token, uploader, sharekey, visibility, origin_url } = req.body;

    if (!req.file) return res.status(400).send("No file uploaded!");

    // Validate user session
    db.query("SELECT * FROM users WHERE sessionToken = ?", [session_token], (err, users) => {
        if (err) return res.status(500).send("Server error: " + err);
        if (!users.length) return res.status(403).send("Invalid session token");

        const user = users[0];

        if (!["owner","admin"].includes(user.level.toLowerCase())) {
            return res.status(403).send("You do not have permission to upload files");
        }

        // Generate UUID filename
        const fileUUID = uuidv4();
        const ext = path.extname(req.file.originalname);
        const newFilename = fileUUID + ext;
        const newPath = path.join(UPLOADS_DIR, newFilename);

        // Move uploaded file to UUID filename
        fs.rename(req.file.path, newPath, (err) => {
            if (err) return res.status(500).send("Error saving file: " + err);

            // Insert metadata into DB
            db.query(
                "INSERT INTO files (UUID, filename, uploader, data_path, sharekey, visibility) VALUES (?, ?, ?, ?, ?, ?)",
                [fileUUID, req.file.originalname, uploader, newPath, sharekey, visibility],
                (err2) => {
                    if (err2) return res.status(500).send("Database error: " + err2);

                    // Redirect or send success
                    const redirectUrl = origin_url || "/";
                    res.redirect(redirectUrl);
                }
            );
        });
    });
});

// --------------------
// Serve uploaded files
// --------------------
app.get('/files/:id', (req, res) => {
    const fileUUID = req.params.id;

    db.query("SELECT * FROM files WHERE UUID = ?", [fileUUID], (err, files) => {
        if (err) return res.status(500).send("Server error: " + err);
        if (!files.length) return res.status(404).send("File not found");

        const file = files[0];

        // Check visibility
        if (file.visibility === "private" && file.sharekey !== req.query.sharekey) {
            return res.status(403).send("You don't have permission to access this file.");
        }

        res.sendFile(path.resolve(file.data_path));
    });
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
    console.log(`File server running at http://localhost:${PORT}`);
});
