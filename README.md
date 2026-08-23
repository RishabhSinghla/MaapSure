# MaapSure

MaapSure is a working SIH 2026 prototype for problem statement **SIH26035**. It turns observations from a non-automatic weighing instrument test into an automatically evaluated OIML R 76 report with a QR-verifiable public record.

## Start it

You need Node.js 20 or newer.

```bash
npm install
npm run build
npm start
```

Open [http://localhost:4173](http://localhost:4173).

Demo login:

- Email: `admin@maapsure.in`
- Password: `Demo@123`

Inspector login:

- Email: `inspector@maapsure.in`
- Password: `Inspect@123`

For live development, run `npm run dev`. The web app opens at [http://localhost:5173](http://localhost:5173).

## What works

- Instrument registration for OIML Classes I, II, III and IIII
- Automatic maximum permitted error selection using OIML R 76-1:2006 Table 6
- Weighing performance, repeatability, eccentric loading and zero-return checks
- Explainable diagnostic findings for calibration bias, instability, corner imbalance and zero drift
- Role-based demo sign-in
- Saved instrument and test repository
- Camera-friendly evidence attachment
- Browser voice dictation for inspector notes
- Professional two-page PDF report
- Unique QR code and public certificate verification page
- Responsive mobile and desktop interface
- Seeded pass and fail reports for an immediate demonstration
- Automated rule-engine tests

## Product structure

- `src/` contains the React application.
- `server/` contains the Express API, report generator and local data store.
- `shared/oimlEngine.js` owns every standards-based calculation.
- `tests/` verifies the important calculation boundaries and pass/fail behavior.
- Runtime records are written to `data/database.json`. The file is created automatically on first start.

## Check the build

```bash
npm run check
```

## Important prototype boundary

MaapSure currently provides a complete digital workflow for four core metrological checks. OIML R 76 includes additional type-evaluation tests covering influence factors, disturbances, durability and device-specific functions. Those should be added with an authorized Legal Metrology expert before real statutory use.

The application is decision support. Final model approval, verification and stamping remain with the legally authorized authority.

## Before a public deployment

Set strong values in `.env`:

```bash
JWT_SECRET=a-long-random-secret
PUBLIC_BASE_URL=https://your-domain.example
PORT=4173
```

Replace the local JSON store and demo passwords with a managed database and organization identity provider before holding real laboratory or personal data.
