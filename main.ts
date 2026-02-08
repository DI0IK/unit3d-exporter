import express from "express";
import fetch from "node-fetch";

const app = express();

function getValue(rawValue: string | number): number | null {
	const input = String(rawValue).trim();

	if (input === "") return null;

	const match = input.match(/^([\d.]+)\s*([a-zA-Z]*)$/);

	if (!match) return null;

	const numValue = parseFloat(match[1]!);
	const unit = match[2]!.toUpperCase();

	if (Number.isNaN(numValue)) return null;

	if (!unit) return numValue;

	const multipliers: Record<string, number> = {
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

	if (unit in multipliers) {
		return numValue * multipliers[unit]!;
	}

	return null;
}

app.get("/metrics", async (_req, res) => {
	let response = "";

	const trackerList = (process.env.TRACKERS || "")
		.split(";")
		.map((i) => i.trim())
		.filter((i) => i);

	for (const tracker of trackerList) {
		const api_key = process.env[`TRACKER_${tracker}_API_KEY`] || "";
		const url = process.env[`TRACKER_${tracker}_URL`] || "";

		if (!api_key.trim() || !url.trim()) continue;

		try {
			const data = await fetch(`${url}/api/user?api_token=${api_key}`);
			const dataObject: { [key: string]: string | number } =
				(await data.json()) as { [key: string]: string | number };
			Object.entries(dataObject).forEach(([key, rawValue]) => {
				const value = getValue(rawValue);
				if (value !== null)
					response += `tracker_unit3d_${key}{tracker="${tracker}"} ${value}\n`;
			});
		} catch (e) {
			console.error(e);
		}
	}

	res
		.contentType(
			"text/plain; version=0.0.4; charset=utf-8; escaping=underscores",
		)
		.send(response);
});

app.listen(3000, () => {
	console.log("Metrics scraper running at 0.0.0.0:3000");
});
