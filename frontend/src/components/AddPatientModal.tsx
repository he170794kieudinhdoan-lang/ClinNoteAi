"use client";

/**
 * AddPatientModal — overlay trên Dashboard.
 *
 * Flow: Dashboard bấm "Thêm bệnh nhân" → form → POST encounter → /encounters/:id (empty).
 *
 * TODO: field họ tên, tuổi, giới tính, lý do khám; validate; gọi api.createEncounter.
 */

export default function AddPatientModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-4">
        <h2 className="font-semibold">Thêm bệnh nhân (placeholder)</h2>
        <p className="mt-2 text-sm text-gray-600">Form đăng ký — triển khai sau.</p>
        <button type="button" className="mt-4 underline" onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  );
}
