const db = require('../sql/db_connector');
const { minimatch } = require("minimatch");

function userManager(req, res, next) {
    const ip = req.ip;
    const threshold = 3;

    const banned_routes = [
        "/wp-admin*",
        "/*.env*",
        "/env.sample",
        "/env.example",
        "/wp-*",
        "/install.php",
        "/installer.php",
        "/config*",
        "*wlwmanifest.xml",
        ".well-known*",
        "*.php"
    ];

    const isHoneypot = banned_routes.some(pattern =>
        minimatch(req.path, pattern, { nocase: true })
    );

    db.query("SELECT * FROM banned_ips WHERE ip = ?", [ip], (err, result) => {
        if (err) {
            console.error("DB error:", err);
            return res.status(500).send("Server error");
        }

        const record = result[0];

        // 🚫 Hard ban
        if (record && record.hits >= threshold) {
            res.locals.banReason = record.reason;
            return res.status(404).render("./error/backdoor");
        }

        // 🪤 Honeypot hit
        if (isHoneypot) {
            db.query(
                `INSERT INTO banned_ips (ip, hits, reason)
                 VALUES (?, 1, ?)
                 ON DUPLICATE KEY UPDATE hits = hits + 1`,
                [ip, "Security system flagged this IP as malicious"]
            );

            res.locals.banReason = "Suspicious activity detected";
            return res.status(404).render("./error/backdoor");
        }

        return next();
    });
}

module.exports = userManager;
