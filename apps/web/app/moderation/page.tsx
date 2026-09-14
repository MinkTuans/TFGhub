import { redirect } from "next/navigation";
import type { ReportSummary } from "@indieforge/contracts";
import { ModerationActions } from "../../components/moderation-actions";
import { ApiError } from "../../lib/api-client";
import { privateGet } from "../../lib/session";

export default async function ModerationPage() {
  let reports: ReportSummary[];
  try {
    reports = await privateGet<ReportSummary[]>("/moderation/reports");
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) redirect("/studio");
    throw error;
  }
  return (
    <main>
      <h1>Moderation queue</h1>
      {reports.length === 0 ? (
        <p>No open reports.</p>
      ) : (
        reports.map((report) => (
          <article className="card" key={report.id}>
            <h2>{report.gameTitle}</h2>
            <p className="badge">
              {report.category} · {report.status} · {report.moderationState}
            </p>
            <p>{report.evidence}</p>
            {report.appealMessage && <p>Appeal: {report.appealMessage}</p>}
            <ModerationActions id={report.id} />
          </article>
        ))
      )}
    </main>
  );
}
