"use client";

/** Rolling pixel odometer. Each digit is a 0-9 column translated in steps. */
export default function Odometer({ value, decimals = 0, className = "" }: { value: number; decimals?: number; className?: string }) {
  const str = value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const chars = str.split("");
  return (
    <span className={`inline-flex font-head leading-none tabular-nums ${className}`} aria-label={str}>
      {chars.map((c, i) => {
        const key = chars.length - i; // stable from the right
        if (!/\d/.test(c)) {
          return (
            <span key={`s${key}`} className="inline-block">
              {c}
            </span>
          );
        }
        const d = Number(c);
        return (
          <span key={`d${key}`} className="relative inline-block h-[1em] w-[1em] overflow-hidden">
            <span className="odo-col absolute left-0 top-0 flex flex-col" style={{ transform: `translateY(-${d}em)` }}>
              {Array.from({ length: 10 }, (_, n) => (
                <span key={n} className="block h-[1em] leading-none">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
