import { useStudio } from "./studio-provider";

/** Persistent failures stay visible until recovery; no timed dismissal hides unsaved work. */
export function StudioToast() {
  const { state, dispatch } = useStudio();
  if (state.status !== "UNSYNCED" && state.status !== "CONFLICT") return null;
  return (
    <div className="studio-notice" role="alert">
      <p>
        {state.status === "CONFLICT"
          ? "Dự án có phiên bản mới trên máy chủ. Thay đổi tại đây vẫn được giữ lại và chưa ghi đè lên máy chủ."
          : state.batchError
            ? "Gói thay đổi không thể đồng bộ trong giới hạn 100 lệnh. Dữ liệu vẫn được giữ trên trình duyệt; cần kiểm tra gói khôi phục trước khi tiếp tục."
            : state.recoveryError
              ? "Không thể đọc hoặc lưu dữ liệu khôi phục trên trình duyệt. Hãy thử đồng bộ lại trước khi chỉnh sửa dự án."
              : "Chưa thể đồng bộ dự án. Thay đổi đã được giữ trên trình duyệt để thử lại."}
      </p>
      {state.status === "UNSYNCED" && !state.batchError && (
        <button type="button" onClick={() => dispatch({ type: "retry" })}>
          Thử đồng bộ lại
        </button>
      )}
    </div>
  );
}
