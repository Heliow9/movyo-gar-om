import React from "react";

const Mapa = ({ fullscreen = false }) => {
  return (
    <div
      style={{
        width: "100%",
        height: fullscreen ? "70vh" : 320,
        borderRadius: 16,
        border: "1px solid rgba(148, 163, 184, 0.35)",
        background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: "#475569",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div>
        <strong>Mapa desativado nesta versão</strong>
        <br />
        O componente antigo com Mapbox foi removido para evitar tokens expostos no GitHub.
      </div>
    </div>
  );
};

export default Mapa;
