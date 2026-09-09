import { useState } from "react";
import { useStudio } from "./studio-provider";
import { StudioConfirmation } from "./studio-confirmation";

/** Persistent failures stay visible until recovery; no timed dismissal hides unsaved work. */
export function StudioToast() {
  const { state, dispatch } = useStudio();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const syncError = state.status === "UNSYNCED" || state.status === "CONFLICT";
  if (!syncError && !state.commandError) return null;
  return (
    <div className="studio-notice" role="alert">
      {state.commandError && <p>{state.commandError}</p>}
      {state.resolutionError && <p>{state.resolutionError}</p>}
      {syncError && (
        <p>
          {state.status === "CONFLICT"
            ? "Dự án có phiên bản mới trên máy chủ. Thay đổi tại đây vẫn được giữ lại và chưa ghi đè lên máy chủ."
            : state.batchError
              ? "Gói thay đổi không thể đồng bộ trong giới hạn 100 lệnh hoặc 4 MiB. Dữ liệu vẫn được giữ trên trình duyệt; cần kiểm tra gói khôi phục trước khi tiếp tục."
              : state.recoveryError
                ? "Không thể đọc hoặc lưu dữ liệu khôi phục trên trình duyệt. Hãy thử đồng bộ lại trước khi chỉnh sửa dự án."
                : "Chưa thể đồng bộ dự án. Thay đổi đã được giữ trên trình duyệt để thử lại."}
        </p>
      )}
      {state.status === "CONFLICT" && (
        <>
          <p>
            {state.resolution
              ? "Đang tải và lưu bản khôi phục. Vui lòng chờ trước khi chỉnh sửa."
              : "Áp dụng lại sẽ chạy các lệnh cục bộ trên bản máy chủ mới nhất và có thể thay đổi các mục bạn đã sửa. Bạn cũng có thể bỏ các thay đổi cục bộ để tải bản máy chủ."}
          </p>
          <div className="studio-actions">
            <button
              type="button"
              disabled={!!state.resolution}
              onClick={() =>
                dispatch({ type: "resolve-conflict", strategy: "reapply" })
              }
            >
              Áp dụng lại thay đổi của tôi
            </button>
            <button
              type="button"
              disabled={!!state.resolution}
              onClick={() => setConfirmDiscard(true)}
            >
              Bỏ thay đổi và tải bản máy chủ
            </button>
          </div>
          {confirmDiscard && (
            <StudioConfirmation
              title="Bỏ thay đổi cục bộ?"
              confirmLabel="Bỏ thay đổi và tải lại"
              onCancel={() => setConfirmDiscard(false)}
              onConfirm={() => {
                setConfirmDiscard(false);
                dispatch({ type: "resolve-conflict", strategy: "discard" });
              }}
            >
              <p>
                Các thay đổi chưa đồng bộ và lịch sử hoàn tác tại đây sẽ bị xóa
                sau khi tải và lưu bản máy chủ thành công. Hành động này không
                thể hoàn tác.
              </p>
            </StudioConfirmation>
          )}
        </>
      )}
      {state.status === "UNSYNCED" && !state.batchError && (
        <button type="button" onClick={() => dispatch({ type: "retry" })}>
          Thử đồng bộ lại
        </button>
      )}
    </div>
  );
}
