import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCORES_FILE = path.join(__dirname, "scores.json");

async function initScoresFile() {
    try {
        await fs.access(SCORES_FILE);
    } catch {
        await fs.writeFile(SCORES_FILE, JSON.stringify({}));
    }
}
export const fruitRoutes = (app) => {
    function countryCodeToFlag(code) {
        return code
            .toUpperCase()
            .split("")
            .map((char) => String.fromCodePoint(char.charCodeAt(0) + 127397))
            .join("");
    }

    async function updateScores(countryCode, countryName, score) {
        const scores = JSON.parse(await fs.readFile(SCORES_FILE, "utf8")); // Use 'utf8' encoding

        if (!scores[countryCode] || scores[countryCode].score < score) {
            scores[countryCode] = {
                name: countryName,
                score: score,
                timestamp: Date.now(),
            };
            await fs.writeFile(SCORES_FILE, JSON.stringify(scores, null, 2), "utf8"); // Use 'utf8' encoding
        }
    }

    async function getTop3Countries() {
        const scores = JSON.parse(await fs.readFile(SCORES_FILE, "utf8")); // Use 'utf8' encoding
        return Object.entries(scores)
            .sort(([, a], [, b]) => b.score - a.score)
            .slice(0, 3)
            .map(([code, data]) => ({
                countryCode: code,
                countryName: data.name,
                score: data.score,
                flag: countryCodeToFlag(code.toUpperCase()),
            }));
    }

    app.post("/fruit/score", async (req, res) => {
        const countryCode = req.headers["geoip_country_code"] || "cz";
        const countryName = req.headers["geoip_country_name"] || "Chechia";
        const { score } = req.body;

        if (!countryCode || !countryName || !score) {
            return res.status(400).json({ error: "Missing required data" });
        }

        try {
            await updateScores(countryCode, countryName, score);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: "Server error" });
        }
    });

    app.get("/fruit/score", async (req, res) => {
        try {
            const topCountries = await getTop3Countries();
            res.json(topCountries);
        } catch (error) {
            res.status(500).json({ error: "Server error" });
        }
    });
};

initScoresFile();
