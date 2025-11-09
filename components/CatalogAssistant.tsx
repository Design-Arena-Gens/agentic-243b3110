'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SheetData,
  SheetRow,
  buildSheet,
  downloadWorkbook,
  parseSheetFile,
} from "@/lib/sheet";

type Mapping = Record<string, string>;

const synonymMatrix: Record<string, string[]> = {
  sku: ["sku", "asin", "item id", "parent sku", "product id"],
  title: ["title", "product title", "item name", "product name"],
  description: [
    "description",
    "product description",
    "long desc",
    "details",
  ],
  brand: ["brand", "brand name", "manufacturer"],
  color: ["color", "colour", "shade"],
  size: ["size", "dimension", "measurement"],
  mrp: ["mrp", "maximum retail price", "list price"],
  price: ["price", "selling price", "offer price", "sale price"],
  quantity: ["quantity", "stock", "inventory", "available units"],
  weight: ["weight", "item weight", "unit weight"],
  material: ["material", "fabric", "primary material"],
  category: [
    "category",
    "product type",
    "vertical",
    "myntra category",
    "flipkart category",
  ],
};

const marketplaces = ["Amazon", "Flipkart", "Meesho", "Myntra"] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function autoDetectMappings(template: SheetData, raw: SheetData): Mapping {
  const mapping: Mapping = {};
  const rawNormalized = raw.headers.map((header) => ({
    original: header,
    normalized: normalizeKey(header),
  }));

  template.headers.forEach((header) => {
    const target = normalizeKey(header);

    const directMatch = rawNormalized.find(
      (item) => item.normalized === target
    );
    if (directMatch) {
      mapping[header] = directMatch.original;
      return;
    }

    const synonymEntry = Object.entries(synonymMatrix).find(([, values]) =>
      values.includes(target)
    );
    if (synonymEntry) {
      const [, values] = synonymEntry;
      const matched = rawNormalized.find((item) =>
        values.some((value) => item.normalized.includes(value))
      );
      if (matched) {
        mapping[header] = matched.original;
        return;
      }
    }

    const fuzzy = rawNormalized.find((item) =>
      item.normalized.includes(target.split(" ")[0] ?? "")
    );
    if (fuzzy) {
      mapping[header] = fuzzy.original;
    }
  });

  return mapping;
}

function buildRowFromMappings(
  headers: string[],
  row: SheetRow,
  mapping: Mapping,
  rawHeaders: string[]
): SheetRow {
  const result: SheetRow = {};

  headers.forEach((header) => {
    const sourceColumn = mapping[header];
    if (sourceColumn) {
      result[header] = row[sourceColumn] ?? "";
      return;
    }

    // Smart fill heuristics
    const normalized = normalizeKey(header);
    if (normalized.includes("title")) {
      const brand =
        row[
          rawHeaders.find((key) => normalizeKey(key).includes("brand")) ?? ""
        ] ?? "";
      const name =
        row[
          rawHeaders.find((key) => normalizeKey(key).includes("name")) ?? ""
        ] ?? "";
      result[header] = `${brand ? `${brand} ` : ""}${name}`.trim();
      return;
    }

    if (normalized.includes("bullet")) {
      const desc =
        row[
          rawHeaders.find((key) => normalizeKey(key).includes("description")) ??
            ""
        ];
      if (desc) {
        const segments = desc.split(/[.|•|\n]/).map((item) => item.trim());
        result[header] =
          segments.find((segment) => segment.length > 20)?.slice(0, 180) ?? "";
        return;
      }
    }

    if (normalized.includes("keywords")) {
      const keywords: string[] = [];
      ["material", "color", "size", "category"].forEach((key) => {
        const value =
          row[
            rawHeaders.find((headerName) =>
              normalizeKey(headerName).includes(key)
            ) ?? ""
          ];
        if (value) {
          keywords.push(value);
        }
      });
      result[header] = keywords
        .map((keyword) => keyword.toLowerCase())
        .filter(Boolean)
        .join(", ");
      return;
    }

    result[header] = "";
  });

  return result;
}

export default function CatalogAssistant() {
  const [template, setTemplate] = useState<SheetData | null>(null);
  const [raw, setRaw] = useState<SheetData | null>(null);
  const [mappings, setMappings] = useState<Mapping>({});
  const [preview, setPreview] = useState<SheetRow[]>([]);
  const [enrichmentNotes, setEnrichmentNotes] = useState<string[]>([]);
  const [activeMarketplace, setActiveMarketplace] =
    useState<(typeof marketplaces)[number]>("Amazon");
  const [isGenerating, setIsGenerating] = useState(false);

  const marketplaceTags = useMemo(() => {
    if (!raw) return [];
    const tags = new Set<string>();
    raw.headers.forEach((header) => {
      const normalized = normalizeKey(header);
      marketplaces.forEach((marketplace) => {
        if (normalized.includes(marketplace.toLowerCase())) {
          tags.add(marketplace);
        }
      });
    });
    return Array.from(tags);
  }, [raw]);

  const updatePreview = useCallback(() => {
    if (!template || !raw) return;
    const rows = raw.rows.map((row) =>
      buildRowFromMappings(template.headers, row, mappings, raw.headers)
    );
    setPreview(rows.slice(0, 25));
  }, [template, raw, mappings]);

  useEffect(() => {
    updatePreview();
  }, [updatePreview]);

  useEffect(() => {
    if (template && raw) {
      setMappings(autoDetectMappings(template, raw));
    }
  }, [template, raw]);

  const handleFileUpload = async (
    file: File,
    type: "template" | "raw"
  ): Promise<void> => {
    if (!file) return;
    const data = await parseSheetFile(file);
    if (!data.headers.length) {
      throw new Error("No columns detected in sheet.");
    }

    if (type === "template") {
      setTemplate(data);
    } else {
      setRaw(data);
    }
  };

  const handleMappingChange = (header: string, value: string) => {
    setMappings((prev) => ({
      ...prev,
      [header]: value,
    }));
  };

  const generateFullWorkbook = () => {
    if (!template || !raw) return;
    const filled = raw.rows.map((row) =>
      buildRowFromMappings(template.headers, row, mappings, raw.headers)
    );
    const workbook = buildSheet(template.headers, filled);
    downloadWorkbook(
      workbook,
      `catalog-${activeMarketplace.toLowerCase()}-${Date.now()}.xlsx`
    );
  };

  const runEnrichment = async () => {
    if (!raw || !preview.length) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "catalog-enrichment",
          marketplace: activeMarketplace,
          sample: preview.slice(0, 5),
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setEnrichmentNotes(data.enrichment ?? []);
    } catch (error) {
      console.error(error);
      setEnrichmentNotes([
        "Could not reach enrichment model. Please verify the serverless function and OpenAI credentials.",
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">
        <div className="pill">Catalog autopilot</div>
        <h2>Marketplace Sheet Builder</h2>
      </div>
      <p style={{ color: "rgba(188, 215, 255, 0.7)" }}>
        Feed in your marketplace template and raw inventory dump. Jarvis aligns
        headers, enriches catalog fields, and exports polished XLSX files for
        every channel.
      </p>

      <div className="grid" style={{ marginTop: 18, gap: 20 }}>
        <div>
          <label htmlFor="template-upload">Marketplace template</label>
          <input
            id="template-upload"
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFileUpload(file, "template");
            }}
          />
        </div>
        <div>
          <label htmlFor="raw-upload">Raw catalog data</label>
          <input
            id="raw-upload"
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFileUpload(file, "raw");
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 18,
          alignItems: "center",
        }}
      >
        <label htmlFor="marketplace">
          Focus marketplace
          <select
            id="marketplace"
            style={{ marginTop: 8 }}
            value={activeMarketplace}
            onChange={(event) =>
              setActiveMarketplace(event.target.value as (typeof marketplaces)[number])
            }
          >
            {marketplaces.map((marketplace) => (
              <option key={marketplace}>{marketplace}</option>
            ))}
          </select>
        </label>
        {marketplaceTags.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {marketplaceTags.map((tag) => (
              <span key={tag} className="tag">
                {tag} columns detected
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {template && raw ? (
        <>
          <div style={{ marginTop: 24 }}>
            <h3
              style={{
                fontSize: "1.1rem",
                marginBottom: 12,
                color: "#9fc5ff",
              }}
            >
              Column alignment
            </h3>
            <div className="grid" style={{ gap: 12 }}>
              {template.headers.map((header) => (
                <div
                  key={header}
                  style={{
                    display: "grid",
                    gap: 6,
                    gridTemplateColumns: "1fr 1fr",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#e0ecff",
                      fontSize: "0.95rem",
                    }}
                  >
                    {header}
                  </div>
                  <select
                    value={mappings[header] ?? ""}
                    onChange={(event) =>
                      handleMappingChange(header, event.target.value)
                    }
                  >
                    <option value="">-- Empty --</option>
                    {raw.headers.map((rawHeader) => (
                      <option key={rawHeader} value={rawHeader}>
                        {rawHeader}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <h3
              style={{
                fontSize: "1.1rem",
                marginBottom: 12,
                color: "#9fc5ff",
              }}
            >
              Preview (first {preview.length} rows)
            </h3>
            {preview.length ? (
              <div style={{ overflowX: "auto" }}>
                <table className="catalog-table">
                  <thead>
                    <tr>
                      {template.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {template.headers.map((header) => (
                          <td key={header}>{row[header] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                Mapping ready. Tap enrich or export to generate the catalog.
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 22,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={runEnrichment}
              disabled={isGenerating}
              className="microphone-button"
              style={{
                background:
                  "linear-gradient(135deg, #f7b733 0%, #fc4a1a 100%)",
                color: "#220b01",
              }}
            >
              {isGenerating ? "Analysing..." : "Enrich copy & SEO"}
            </button>

            <button
              type="button"
              onClick={generateFullWorkbook}
              className="microphone-button"
              style={{
                background:
                  "linear-gradient(135deg, #31d8a4 0%, #46f1d3 100%)",
                color: "#012016",
              }}
            >
              Export XLSX
            </button>
          </div>

          {enrichmentNotes.length ? (
            <div style={{ marginTop: 18 }}>
              <h3
                style={{
                  fontSize: "1.05rem",
                  color: "#ffc27a",
                  marginBottom: 10,
                }}
              >
                Enrichment playbook
              </h3>
              <ul style={{ listStyle: "disc", marginLeft: 20, color: "#f9d7a9" }}>
                {enrichmentNotes.map((note, index) => (
                  <li key={index} style={{ marginBottom: 6 }}>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state" style={{ marginTop: 24 }}>
          Upload both the marketplace template and your raw catalog extract to
          activate Jarvis catalog automation.
        </div>
      )}
    </div>
  );
}
