import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BarcodeScanner from "react-qr-barcode-scanner";
import { parseScoutingQR } from "../utils/parseScoutingQR";
import { saveScoutingRecord } from "../services/firestore";
import type { ScoutingRecord } from "../types/scoutingData";
import { useCompetition } from "../context/CompetitionContext";

type CameraState = "idle" | "active" | "denied" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

// ── Decoded data preview ──────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-gray-200">{value}</span>
    </div>
  );
}

function BoolBadge({ value }: { value: boolean }) {
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${value ? "bg-green-900/60 text-green-300" : "bg-gray-700 text-gray-400"}`}>
      {value ? "Yes" : "No"}
    </span>
  );
}

function RecordPreview({ record, eventKey, onSave, onDiscard }: {
  record: ScoutingRecord;
  eventKey: string;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const { auto, teleop, endgame, teamInfo } = record;

  async function handleSave() {
    setSaveState("saving");
    try {
      await saveScoutingRecord(eventKey, record);
      setSaveState("saved");
      onSave();
    } catch (e) {
      console.error(e);
      setSaveState("error");
    }
  }

  return (
    <section className="bg-gray-900 rounded-2xl border border-blue-800/60 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <h2 className="text-sm font-semibold text-gray-200">Scouting Data Detected</h2>
        </div>
        <div className="flex items-center gap-2">
          {saveState === "error" && <span className="text-xs text-red-400">Save failed</span>}
          <button onClick={onDiscard} className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition cursor-pointer">
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={saveState === "saving" || saveState === "saved"}
            className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 transition cursor-pointer"
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : "Save to Firestore"}
          </button>
        </div>
      </div>

      {/* Team / Match identity */}
      <div className="bg-gray-800/50 rounded-xl p-3 grid grid-cols-3 gap-3">
        <Field label="Team" value={<span className="font-bold text-blue-400 text-base">{teamInfo.teamNumber}</span>} />
        <Field label="Match" value={teamInfo.matchNumber} />
        <Field label="Alliance" value={
          <span className={`font-semibold ${teamInfo.alliance === "red" ? "text-red-400" : "text-blue-400"}`}>
            {teamInfo.alliance.toUpperCase()}
          </span>
        } />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Auto */}
        <div className="bg-gray-800/50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Autonomous</p>
          <Field label="Score" value={auto.score} />
          <Field label="Paths" value={auto.paths.length > 0 ? auto.paths.join(" → ") : "—"} />
          <Field label="Preloaded" value={<BoolBadge value={auto.preloaded} />} />
          <Field label="Climb Attempted" value={<BoolBadge value={auto.climbAttempted} />} />
          <Field label="Climb Successful" value={<BoolBadge value={auto.climbSuccessful} />} />
        </div>

        {/* Teleop */}
        <div className="bg-gray-800/50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Teleop</p>
          <Field label="Score" value={teleop.score} />
          <Field label="Balls Made" value={teleop.ballsMade} />
          <Field label="Balls Transferred" value={teleop.ballsTransferred} />
          <Field label="Bricked" value={<BoolBadge value={teleop.bricked} />} />
          <Field label="Played Defense" value={<BoolBadge value={teleop.playedDefense} />} />
        </div>

        {/* Endgame */}
        <div className="bg-gray-800/50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Endgame</p>
          <Field label="Climb Attempted" value={<BoolBadge value={endgame.attempted} />} />
          <Field label="Climb Level" value={endgame.level > 0 ? `L${endgame.level}` : "None"} />
          <Field label="Driver Rating" value={`${endgame.rating} / 10`} />
          <Field label="Fouls" value={endgame.fouls} />
          {endgame.notes && <Field label="Notes" value={<span className="italic text-gray-400">{endgame.notes}</span>} />}
        </div>
      </div>
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QRScannerPage() {
  const navigate = useNavigate();
  const { competition } = useCompetition();

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [stopStream, setStopStream] = useState(false);
  const [rawText, setRawText] = useState<string | null>(null);
  const [parsedRecord, setParsedRecord] = useState<ScoutingRecord | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScoutingRecord[]>([]);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const eventKey = competition?.event.key ?? null;

  useEffect(() => {
    return () => { setStopStream(true); };
  }, []);

  function startScanner() {
    setParsedRecord(null);
    setParseError(null);
    setRawText(null);
    setStopStream(false);
    setCameraState("active");
  }

  function stopScanner() {
    setStopStream(true);
    setTimeout(() => setCameraState("idle"), 0);
  }

  function handleUpdate(_err: unknown, result: { getText(): string } | undefined) {
    if (!result) return;
    const text = result.getText();
    if (text === rawText) return; // same QR, skip

    setRawText(text);
    try {
      const record = parseScoutingQR(text);
      setParsedRecord(record);
      setParseError(null);
      stopScanner();
    } catch (e) {
      // Not a scouting QR — show raw text only, don't stop camera
      setParsedRecord(null);
      setParseError(null);
      setRawText(text);
    }
  }

  function handleError(err: unknown) {
    const name = (err as { name?: string })?.name;
    setCameraState(name === "NotAllowedError" ? "denied" : "error");
    setStopStream(true);
  }

  function handleSaved() {
    if (parsedRecord) {
      setHistory((prev) => [parsedRecord, ...prev].slice(0, 50));
    }
    setParsedRecord(null);
    setRawText(null);
  }

  function handleDiscard() {
    setParsedRecord(null);
    setRawText(null);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75V16.5ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">QR Scanner</h1>
            <p className="text-xs text-gray-400">
              {eventKey ? `Saving to: ${eventKey}` : "No competition loaded — data preview only"}
            </p>
          </div>
        </div>
        <button
          onClick={() => { stopScanner(); navigate(-1); }}
          className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition cursor-pointer"
        >
          ← Back
        </button>
      </header>

      <main className="p-6 max-w-3xl mx-auto space-y-6">
        {/* No competition warning */}
        {!eventKey && (
          <div className="flex items-center gap-3 bg-yellow-900/30 border border-yellow-700/50 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-xs text-yellow-300">
              No competition loaded. Scanned data will be displayed but <strong>not saved</strong>.{" "}
              <button onClick={() => navigate("/")} className="underline hover:text-yellow-200 cursor-pointer">Load a competition first.</button>
            </p>
          </div>
        )}

        {/* Scanner viewport */}
        <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          {cameraState === "idle" && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
              <div className="w-16 h-16 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-300">Camera is off</p>
                <p className="text-xs text-gray-500 mt-1">Start the scanner to read scouting QR codes</p>
              </div>
              <button onClick={startScanner} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition cursor-pointer">
                Start Scanner
              </button>
            </div>
          )}

          {cameraState === "denied" && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
              <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <p className="text-sm font-medium text-red-300">Camera permission denied</p>
              <p className="text-xs text-gray-500">Allow camera access in your browser settings and try again.</p>
              <button onClick={startScanner} className="text-xs border border-gray-600 hover:border-gray-400 text-gray-300 px-4 py-2 rounded-lg transition cursor-pointer">Try Again</button>
            </div>
          )}

          {cameraState === "error" && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
              <svg className="w-10 h-10 text-yellow-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p className="text-sm font-medium text-yellow-300">Camera error</p>
              <p className="text-xs text-gray-500">Could not access the camera. Make sure no other app is using it.</p>
              <button onClick={startScanner} className="text-xs border border-gray-600 hover:border-gray-400 text-gray-300 px-4 py-2 rounded-lg transition cursor-pointer">Try Again</button>
            </div>
          )}

          {cameraState === "active" && (
            <div className="relative">
              <BarcodeScanner
                width="100%"
                height={360}
                facingMode={facingMode}
                stopStream={stopStream}
                onUpdate={handleUpdate}
                onError={handleError}
                delay={300}
              />
              <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-blue-500/20 rounded-b-none" />
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-black/70 to-transparent">
                <button
                  onClick={() => setFacingMode((p) => p === "environment" ? "user" : "environment")}
                  className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white bg-gray-800/70 hover:bg-gray-700/80 border border-gray-600 rounded-lg px-3 py-1.5 transition cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Flip Camera
                </button>
                <button onClick={stopScanner} className="text-xs text-red-300 hover:text-red-200 bg-gray-800/70 hover:bg-gray-700/80 border border-gray-600 rounded-lg px-3 py-1.5 transition cursor-pointer">
                  Stop
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Parse error / raw non-scouting QR */}
        {parseError && (
          <section className="bg-gray-900 rounded-2xl border border-yellow-800/60 p-4">
            <p className="text-xs text-yellow-400">{parseError}</p>
          </section>
        )}

        {/* Raw text for non-scouting QRs */}
        {rawText !== null && !parsedRecord && !parseError && (
          <section className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <h2 className="text-sm font-semibold text-gray-300">Raw QR Data</h2>
                <span className="text-xs text-gray-500">(not a scouting QR)</span>
              </div>
              <button onClick={() => navigator.clipboard?.writeText(rawText)} className="text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-2.5 py-1 transition cursor-pointer">Copy</button>
            </div>
            <p className="text-sm font-mono text-gray-300 break-all bg-gray-800/60 rounded-lg px-3 py-2.5">{rawText}</p>
          </section>
        )}

        {/* Structured scouting data preview */}
        {parsedRecord && eventKey && (
          <RecordPreview
            record={parsedRecord}
            eventKey={eventKey}
            onSave={handleSaved}
            onDiscard={handleDiscard}
          />
        )}
        {parsedRecord && !eventKey && (
          <RecordPreview
            record={parsedRecord}
            eventKey=""
            onSave={handleDiscard}
            onDiscard={handleDiscard}
          />
        )}

        {/* Session history */}
        {history.length > 0 && (
          <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-200">
                Saved This Session
                <span className="ml-2 text-xs font-normal text-gray-500">({history.length})</span>
              </h2>
              <button onClick={() => setHistory([])} className="text-xs text-gray-500 hover:text-red-400 transition cursor-pointer">Clear</button>
            </div>
            <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {history.map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/60">
                  <span className={`text-xs font-bold w-8 shrink-0 ${r.teamInfo.alliance === "red" ? "text-red-400" : "text-blue-400"}`}>
                    {r.teamInfo.teamNumber}
                  </span>
                  <span className="text-xs text-gray-400">Match {r.teamInfo.matchNumber}</span>
                  <span className="text-xs text-gray-500 flex-1">
                    Auto {r.auto.score} · Teleop {r.teleop.score}
                    {r.endgame.level > 0 && ` · L${r.endgame.level}`}
                  </span>
                  <span className="text-xs text-gray-600">{new Date(r.scannedAt).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
