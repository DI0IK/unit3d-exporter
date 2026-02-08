import express from "express";
import fetch from "node-fetch";

const app = express();

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
			Object.entries(dataObject).forEach(([key, value]) => {
				response += `tracker_unit3d_${key}{tracker="${tracker}"} = ${value}\n`;
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
