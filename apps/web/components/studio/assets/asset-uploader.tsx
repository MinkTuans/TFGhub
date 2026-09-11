"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { GameAssetSummary } from "@indieforge/contracts";
import { createStudioId } from "../studio-provider";
import type { AssetClient } from "./asset-manager";

type UploadJob = {
  uploadId: string;
  file: File;
  category: string;
  progress: number;
  status: "UPLOADING" | "FAILED";
  error: string;
};

export function AssetUploader({
  gameId,
  category,
  client,
  onUploaded,
}: {
  gameId: string;
  category: string;
  client: AssetClient;
  onUploaded: (asset: GameAssetSummary) => void;
}) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const jobsRef = useRef(new Map<string, UploadJob>());

  function replace(job: UploadJob) {
    jobsRef.current.set(job.uploadId, job);
    setJobs([...jobsRef.current.values()]);
  }
  function remove(uploadId: string) {
    jobsRef.current.delete(uploadId);
    setJobs([...jobsRef.current.values()]);
  }
  async function upload(job: UploadJob) {
    replace({ ...job, status: "UPLOADING", error: "" });
    try {
      const uploaded = await client.upload(
        gameId,
        {
          uploadId: job.uploadId,
          file: job.file,
          category: job.category,
        },
        (progress) =>
          replace({
            ...(jobsRef.current.get(job.uploadId) ?? job),
            progress,
            status: "UPLOADING",
            error: "",
          }),
      );
      remove(job.uploadId);
      onUploaded(uploaded);
    } catch (error) {
      replace({
        ...(jobsRef.current.get(job.uploadId) ?? job),
        status: "FAILED",
        error: error instanceof Error ? error.message : "Tải lên thất bại",
      });
    }
  }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    for (const file of files) {
      const job: UploadJob = {
        uploadId: createStudioId(),
        file,
        category,
        progress: 0,
        status: "UPLOADING",
        error: "",
      };
      void upload(job);
    }
  }

  return (
    <div className="studio-asset-uploader">
      <label className="studio-upload-button">
        Tải lên
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,audio/wav,.png,.jpg,.jpeg,.webp,.wav"
          aria-label="Tải asset lên"
          onChange={choose}
        />
      </label>
      {jobs.map((job) => (
        <div className="studio-upload-job" key={job.uploadId}>
          <span title={job.file.name}>{job.file.name}</span>
          <progress
            max={100}
            value={job.progress}
            aria-label={`Tiến độ ${job.file.name}`}
          />
          <span>{job.progress}%</span>
          {job.status === "FAILED" && (
            <>
              <p role="alert" aria-label={`Lỗi tải ${job.file.name}`}>
                {job.error}
              </p>
              <button
                type="button"
                aria-label={`Thử lại ${job.file.name}`}
                onClick={() => void upload(job)}
              >
                Thử lại
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
