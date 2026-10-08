/**
 * The frame of a live practice screen: a full-screen dark page with a slim bar on top, the
 * camera in the middle (it takes whatever room is left, so nothing ever sits over the player's
 * feet), and the form chips and Finish button underneath.
 */
export default function PracticeShell({ top, bottom, children }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col select-none">
      {top}
      <div className="relative flex-1 min-h-0">{children}</div>
      {bottom}
    </div>
  );
}
