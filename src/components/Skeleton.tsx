import React from "react";

export function SkeletonScoreCard() {
  return (
    <div className="card">
      <div className="section">
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div className="skel" style={{ width: 220, height: 18 }} />
          <div className="skel" style={{ width: 120, height: 30, borderRadius: 999 }} />
        </div>
        <div className="spacer" />
        <div className="row">
          <div className="skel" style={{ width: 180, height: 46 }} />
          <div className="skel" style={{ width: 180, height: 46 }} />
          <div className="skel" style={{ width: 180, height: 46 }} />
        </div>
      </div>
    </div>
  );
}
