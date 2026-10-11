"use client";

import { useEffect, useRef, useState } from "react";
import { AttributionControl, Map, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import type { WaterLocation } from "@/lib/types";
import "maplibre-gl/dist/maplibre-gl.css";

const INITIAL_VIEW: [number, number] = [78.486, 17.385];

type Props = {
  center: [number, number];
  locations: WaterLocation[];
  selected: WaterLocation | null;
  onSelect: (location: WaterLocation | null) => void;
};

export default function MapView({ center, locations, selected, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
    const map = new Map({
      container: hostRef.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: INITIAL_VIEW,
      zoom: 11,
      attributionControl: false,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-left");
    map.on("error", () => { if (!map.isStyleLoaded()) setMapError(true); });
    map.once("load", () => setMapError(false));
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center, zoom: 11, duration: 900, essential: false });
  }, [center]);

  useEffect(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    const map = mapRef.current;
    if (!map) return;
    const verified = locations.filter((item) => item.verification_status.trim().toLowerCase() === "verified");
    for (const location of verified) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "water-marker";
      button.setAttribute("aria-label", `Verified water point: ${location.name}`);
      button.title = location.name;
      button.addEventListener("click", () => onSelect(location));
      const marker = new Marker({ element: button, anchor: "center" })
        .setLngLat([location.longitude, location.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [locations, onSelect]);

  return (
    <div className="map-frame" aria-label="Map of Hyderabad">
      <div ref={hostRef} className="map-canvas" />
      {mapError && <div className="map-notice" role="status">Map tiles could not be loaded. Check the network connection.</div>}
      <div className="map-crosshair" aria-hidden="true"><span /><i /></div>
    </div>
  );
}
