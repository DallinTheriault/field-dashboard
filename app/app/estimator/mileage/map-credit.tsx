/**
 * Miles come from OpenStreetMap data (Nominatim, Valhalla). Its licence and
 * both services' terms ask for this credit, with a "fix the map" link,
 * wherever those miles show.
 */
export function MapCredit({ className = "", inline = false }: { className?: string; inline?: boolean }) {
  const link = "underline decoration-dotted underline-offset-2 hover:text-bone-300";
  const Tag = inline ? "span" : "p";
  return (
    <Tag className={`text-2xs text-bone-500 ${className}`} data-testid="map-credit">
      Map data ©{" "}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className={link}>
        OpenStreetMap contributors
      </a>{" "}
      (ODbL) ·{" "}
      <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer" className={link}>
        Fix the map
      </a>
    </Tag>
  );
}
