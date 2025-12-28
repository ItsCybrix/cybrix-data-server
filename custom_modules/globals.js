const generateMCDCode = require('./Crypto')
const db = require('./sql/db_connector');

function Globals(req, res, next) {

res.locals.MCDCode = generateMCDCode();


    db.query("SELECT * FROM blips", (err, result) => {
        if (err) {
            console.error("DB error in middleware:", err);
            return res.status(500).send("Server error");
        }

        if (result.length === 0) {
            console.log("NO BLIPS!")
        }

        // ✅ Now available in templates
        res.locals.blips = result;
        next();
    });


}

module.exports = Globals