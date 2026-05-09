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
app.use(express.json({ limit: '1024mb' }));
app.use(express.urlencoded({ limit: '1024mb', extended: true }));

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

// Health check
app.get('/', (req, res) => {
    res.send("File server is healthy!");
});


// --------------------
// Upload endpoint
// --------------------
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        const { session_token, uploader, sharekey, visibility, origin_url } = req.body;

        if (!req.file) return res.status(400).send("No file uploaded!");

        db.query("SELECT * FROM users WHERE sessionToken = ?", [session_token], (err, users) => {
            if (err) {
                console.error("DB error:", err); // <-- log DB errors
                return res.status(500).send("Server error: " + err);
            }

            if (!users.length) return res.status(403).send("Invalid session token");

            const user = users[0];
            if (!["owner","admin"].includes(user.level.toLowerCase())) {
                return res.status(403).send("You do not have permission to upload files");
            }

            const fileUUID = uuidv4();
            const ext = path.extname(req.file.originalname);
            const newFilename = fileUUID + ext;
            const newPath = path.join(UPLOADS_DIR, newFilename);

            fs.rename(req.file.path, newPath, (err) => {
                if (err) {
                    console.error("File rename error:", err); // <-- log filesystem errors
                    return res.status(500).send("Error saving file: " + err);
                }

                db.query(
                    "INSERT INTO files (UUID, filename, uploader, data_path, sharekey, visibility, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [fileUUID, req.file.originalname, uploader, newPath, sharekey, visibility, req.body.description],
                    (err2) => {
                        if (err2) {
                            console.error("DB insert error:", err2); // <-- log DB insert errors
                            return res.status(500).send("Database error: " + err2);
                        }

                        if(process.env.ENVIRONMENT == "DEV"){
                        res.redirect('http://127.0.0.1:5050/admin/files');
                        }else{
                        res.redirect('https://cybrixnova.com/admin/files');
                        }
                    }
                );
            });
        });
    } catch (err) {
        console.error("Unexpected error:", err); // <-- catch-all for synchronous errors
        res.status(500).send("Unexpected server error: " + err);
    }
});

app.post('/sharexup', upload.single('file'), (req, res) => {
    try {
        const { key, uploader, sharekey, visibility, origin_url } = req.body;

        // Optional ShareX auth key check
        if (key !== process.env.SHAREX_KEY) {
            return res.status(403).send("Invalid upload key");
        }

        if (!req.file) {
            return res.status(400).send("No file uploaded!");
        }

        const fileUUID = uuidv4();
        const ext = path.extname(req.file.originalname);
        const newFilename = fileUUID + ext;
        const newPath = path.join(UPLOADS_DIR, newFilename);

        fs.rename(req.file.path, newPath, (err) => {
            if (err) {
                console.error("File rename error:", err);
                return res.status(500).send("Error saving file: " + err);
            }

            db.query(
                "INSERT INTO files (UUID, filename, uploader, data_path, sharekey, visibility, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    fileUUID,
                    req.file.originalname,
                    uploader,
                    newPath,
                    sharekey,
                    visibility,
                    req.body.description
                ],
                (err2) => {
                    if (err2) {
                        console.error("DB insert error:", err2);
                        return res.status(500).send("Database error: " + err2);
                    }

                    // Return direct file URL for ShareX
                    const baseUrl =
                        process.env.ENVIRONMENT === "DEV"
                            ? "http://127.0.0.1:5055"
                            : "https://s.cybrixnova.com";

                    res.send(`${baseUrl}/file/${fileUUID}`);
                }
            );
        });

    } catch (err) {
        console.error("Unexpected error:", err);
        res.status(500).send("Unexpected server error: " + err);
    }
});


// --------------------
// Serve uploaded files
// --------------------
app.get('/file/:id', (req, res) => {
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

app.post('/delete/:ID', (req, res)=>{
        db.query("SELECT * FROM users WHERE sessionToken = ?", [req.body.session_token], (err, users) => {
            if (err) {
                console.error("DB error:", err); // <-- log DB errors
                return res.status(500).send("Server error: " + err);
            }

            if (!users.length) return res.status(403).send("Invalid session token");

            const user = users[0];
            if (!["owner","admin"].includes(user.level.toLowerCase())) {
                return res.status(403).send("You do not have permission to delete files");
            }
                            db.query(
                    "DELETE FROM files WHERE ID=?",
                    [req.params.ID],
                    (err2) => {
                        if (err2) {
                            console.error("DB insert error:", err2); // <-- log DB insert errors
                            return res.status(500).send("Database error: " + err2);
                        }


                        if(process.env.ENVIRONMENT == "DEV"){
                        res.redirect('http://127.0.0.1:5050/admin/files');
                        }else{
                        res.redirect('https://cybrixnova.com/admin/files');
                        }

                    }
                );
            });
})

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
    console.log(`File server running at http://localhost:${PORT}`);
});
