import React from "react";

const MiniMapa = ({ latitude, longitude }) => {
  if (!latitude || !longitude) return null;

  return (
    <div
      style={{
        width: "100%",
        minHeight: 120,
        borderRadius: 12,
        border: "1px solid rgba(148, 163, 184, 0.35)",
        background: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: "#475569",
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      Localização capturada: {Number(latitude).toFixed(6)}, {Number(longitude).toFixed(6)}
    </div>
  );
};

export default MiniMapa;
