const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv').config();
let uuidv4;
(async () => {
    const uuid = await import('uuid');
    uuidv4 = uuid.v4;
})();


const app = express();
const PORT = process.env.PORT || 5055;

const db = require('./custom_modules/sql/db_connector');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --------------------
// Setup upload directory
// --------------------
let UPLOADS_DIR;

if (process.env.ENVIRONMENT === 'DEV') {
    UPLOADS_DIR = path.join(__dirname, 'uploads');
    console.log("DEV environment: using local uploads folder.");
} else if (process.env.ENVIRONMENT === 'PROD') {
    UPLOADS_DIR = process.env.UPLOADS_DIR;
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
    filename: (req, file, cb) => cb(null, file.originalname) // initial save
});

const upload = multer({ storage });

// --------------------
// Routes
// --------------------



// --------------------
// Upload endpoint
// --------------------
app.post('/upload', upload.single('file'), (req, res) => {
    const sessionToken = req.body.session_token;

    if (!req.file) return res.status(400).send("No file uploaded!");

    db.query("SELECT * FROM users WHERE sessionToken = ?", [sessionToken], (err, users) => {
        if (err) return res.status(500).send("Server error: " + err);
        if (users.length === 0) return res.status(403).send("Invalid session token");

        const user = users[0];
        console.log(user)
        if (!["Owner", "Admin"].includes(user.level)) {
            return res.status(403).send("You do not have permission to upload files");
        }

        // Generate UUID filename
        const fileUUID = uuidv4();
        const ext = path.extname(req.file.originalname);
        const newFilename = fileUUID + ext;
        const newPath = path.join(UPLOADS_DIR, newFilename);

        // Rename/move file safely
        fs.rename(req.file.path, newPath, (err) => {
            if (err) return res.status(500).send("Error saving file: " + err);

            // Insert metadata into DB
            db.query(
                "INSERT INTO files (UUID, filename, uploader, data_path, sharekey, visibility) VALUES (?, ?, ?, ?, ?, ?)",
                [fileUUID, req.file.originalname, req.body.uploader, newPath, req.body.sharekey, req.body.visibility],
                (err2) => {
                    if (err2) return res.status(500).send("Database error: " + err2);

                    // Redirect or send success
                    const redirectUrl = req.body.origin_url || "/";
                    res.redirect(redirectUrl);
                }
            );
        });
    });
});

// --------------------
// Serve uploaded files securely
// --------------------
app.get('/files/:id', (req, res) => {
    const fileUUID = req.params.id;

    db.query("SELECT * FROM files WHERE UUID = ?", [fileUUID], (err, files) => {
        if (err) return res.status(500).send("Server error: " + err);
        if (files.length === 0) return res.status(404).send("File not found");

        const filePath = files[0].data_path;
        
    if (files[0].visibility === "private") {
        if (files[0].sharekey !== req.query.sharekey) {
            return res.status(403).send("You don't have permission to access this file.");
        }
    }
    res.sendFile(path.resolve(filePath));



    });
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
    console.log(`File server running at http://localhost:${PORT}`);
});
