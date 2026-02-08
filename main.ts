import express, { type Request, type Response } from "express";
import fetch from "node-fetch";

const app = express();

const UNIT_MAP: Record<string, number> = {
	TIB: 1024 ** 4,
	TB: 1000 ** 4,
	GIB: 1024 ** 3,
	GB: 1000 ** 3,
	MIB: 1024 ** 2,
	MB: 1000 ** 2,
	KIB: 1024,
	KB: 1000,
	B: 1,
};

function parseUnit3DValue(rawValue: string | number): number | null {
	const input = String(rawValue).trim().toUpperCase();
	if (!input) return null;

	const match = input.match(/^([\d.]+)\s*([A-Z]*)$/);
	if (!match) return null;

	const num = parseFloat(match[1]!);
	const unit = match[2]!;

	if (Number.isNaN(num)) return null;
	return unit in UNIT_MAP ? num * UNIT_MAP[unit]! : num;
}

/**
 * Encapsulates a single scrape result for sorting
 */
interface ScrapeResult {
	trackerName: string;
	metrics: Map<string, number>;
}

async function scrapeTracker(name: string): Promise<ScrapeResult | null> {
	const apiKey = process.env[`TRACKER_${name}_API_KEY`]?.trim();
	const url = process.env[`TRACKER_${name}_URL`]?.trim();

	if (!apiKey || !url) return null;

	try {
		const res = await fetch(`${url}/api/user?api_token=${apiKey}`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const data = (await res.json()) as Record<string, any>;
		const metrics = new Map<string, number>();

		for (const [key, val] of Object.entries(data)) {
			const parsed = parseUnit3DValue(val);
			if (parsed !== null) {
				// Sanitize key for Prom compliance
				const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
				metrics.set(safeKey, parsed);
			}
		}
		return { trackerName: name, metrics };
	} catch (err) {
		console.error(
			`[${name}] Scrape failed:`,
			err instanceof Error ? err.message : err,
		);
		return null;
	}
}

app.get("/metrics", async (_req: Request, res: Response) => {
	// 1. Get and sort tracker names alphabetically
	const trackerNames = (process.env.TRACKERS || "")
		.split(";")
		.map((t) => t.trim())
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));

	// 2. Scrape in parallel
	const results = (await Promise.all(trackerNames.map(scrapeTracker))).filter(
		(r): r is ScrapeResult => r !== null,
	);

	// 3. Generate Output with deterministic sorting
	let output = "";

	// We group by Metric Name first, then Tracker (Standard Prometheus Pattern)
	// To do this, we need to know all unique metric keys across all trackers
	const allMetricKeys = Array.from(
		new Set(results.flatMap((r) => Array.from(r.metrics.keys()))),
	).sort();

	for (const metricKey of allMetricKeys) {
		const metricName = `tracker_unit3d_${metricKey}`;

		// Optional: Add HELP and TYPE comments for the first occurrence of each metric
		output += `# HELP ${metricName} Unit3D statistics for ${metricKey}\n`;
		output += `# TYPE ${metricName} gauge\n`;

		for (const result of results) {
			const val = result.metrics.get(metricKey);
			if (val !== undefined) {
				output += `${metricName}{tracker="${result.trackerName}"} ${val}\n`;
			}
		}
	}

	res
		.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		.send(output);
});

app.listen(3000);
