# BosaTek Eats

Meal planner for Iowa State dining, at [eats.bosatek.com](https://eats.bosatek.com).
Unofficial student project, not affiliated with Iowa State University or ISU Dining.

```
npm ci --ignore-scripts
npm run dev     # local server
npm test
npm run build
```

- Hand-edited settings (meal plans, scrape schedule, extra venues) are in `config/`.
- Data the site reads is in `public/data/`, updated daily by the Scrape workflow.
- How the ISU data source works: [docs/DISCOVERY.md](docs/DISCOVERY.md)
- Disclaimers: [docs/DISCLAIMERS.md](docs/DISCLAIMERS.md)
