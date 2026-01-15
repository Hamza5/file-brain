"use client";
import React from "react";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { ButtonProps } from "primereact/button";

export const ProVersion = () => {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  const pricingTiers = [
    {
      name: "Knowledge Engine",
      icon: "fa-solid fa-brain",
      preorderPrice: "$99",
      launchPrice: "$149",
      color: "#06b6d4",
      features: [
        "Everything in Free",
        "Chat with files",
        "Find similar files by text",
        "Auto-updates (1 year)",
        "Priority support (1 year)",
      ],
      severity: "info" as ButtonProps["severity"],
    },
    {
      name: "Media Suite",
      icon: "fa-solid fa-film",
      preorderPrice: "$129",
      launchPrice: "$199",
      color: "#8b5cf6",
      features: [
        "Everything in Knowledge Engine",
        "Image search by text/image",
        "Video scene search",
        "Auto-updates (1 year)",
        "Priority support (1 year)",
      ],
      severity: "help" as ButtonProps["severity"],
    },
    {
      name: "Cloud Connect",
      icon: "fa-solid fa-cloud",
      preorderPrice: "$159",
      launchPrice: "$249",
      color: "#f59e0b",
      features: [
        "Everything in Media Suite",
        "Network drives (FTP, SFTP, SMB, WebDAV)",
        "Cloud storage (Google Drive, Dropbox, S3, OneDrive, Box)",
        "Auto-updates (1 year)",
        "Priority support (1 year)",
      ],
      severity: "warning" as ButtonProps["severity"],
    },
  ];

  const comparisonFeatures = [
    {
      name: "Local File Search",
      free: true,
      knowledge: true,
      media: true,
      cloud: true,
    },
    {
      name: "Fuzzy & typo-resistant search",
      free: true,
      knowledge: true,
      media: true,
      cloud: true,
    },
    {
      name: "Text-based semantic search",
      free: true,
      knowledge: true,
      media: true,
      cloud: true,
    },
    {
      name: "Auto-indexing",
      free: true,
      knowledge: true,
      media: true,
      cloud: true,
    },
    {
      name: "Chat with files",
      free: false,
      knowledge: true,
      media: true,
      cloud: true,
    },
    {
      name: "Find similar files by text",
      free: false,
      knowledge: true,
      media: true,
      cloud: true,
    },
    {
      name: "Image search by text/image",
      free: false,
      knowledge: false,
      media: true,
      cloud: true,
    },
    {
      name: "Video scene search",
      free: false,
      knowledge: false,
      media: true,
      cloud: true,
    },
    {
      name: "Network drives (FTP, SFTP, SMB, WebDAV)",
      free: false,
      knowledge: false,
      media: false,
      cloud: true,
    },
    {
      name: "Cloud storage (Google Drive, Dropbox, S3, OneDrive, Box)",
      free: false,
      knowledge: false,
      media: false,
      cloud: true,
    },
    {
      name: "Updates",
      free: "Manual",
      knowledge: "Auto (1 year)",
      media: "Auto (1 year)",
      cloud: "Auto (1 year)",
    },
    {
      name: "Priority support",
      free: false,
      knowledge: "1 year",
      media: "1 year",
      cloud: "1 year",
    },
  ];

  return (
    <section
      className="py-8"
      style={{ backgroundColor: "var(--surface-ground)" }}
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-3">
            <Tag
              value="GO PRO"
              rounded
              severity="info"
              className="text-sm font-bold tracking-widest px-3 py-2"
              style={{
                backgroundColor: "rgba(6, 182, 212, 0.1)",
                color: "var(--primary-color)",
              }}
            ></Tag>
          </div>
          <h2
            className="text-4xl md:text-5xl font-bold mt-2"
            style={{ color: "var(--text-color)" }}
          >
            Choose Your{" "}
            <span style={{ color: "var(--primary-color)" }}>Pro Tier</span>
          </h2>
          <p
            className="text-xl mt-4 max-w-2xl mx-auto"
            style={{ color: "var(--text-color-secondary)" }}
          >
            One-time payment. Auto-updates and priority support for one year.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid mb-8">
          {pricingTiers.map((tier, index) => (
            <div key={index} className="col-12 lg:col-4 p-3">
              <div
                className="h-full p-6 border-round-2xl flex flex-column"
                style={{
                  backgroundColor: "white",
                  boxShadow: "0 4px 15px rgba(0,0,0,0.06)",
                }}
              >
                <div className="text-center mb-4">
                  <div
                    className="w-4rem h-4rem border-round-xl flex align-items-center justify-content-center mx-auto mb-3"
                    style={{
                      backgroundColor: `${tier.color}15`,
                      color: tier.color,
                    }}
                  >
                    <i className={`${tier.icon} text-2xl`}></i>
                  </div>
                  <h3
                    className="text-2xl font-bold mb-2"
                    style={{ color: "var(--text-color)" }}
                  >
                    {tier.name}
                  </h3>
                  <div className="mb-2">
                    <span
                      className="text-4xl font-bold"
                      style={{ color: tier.color }}
                    >
                      {tier.preorderPrice}
                    </span>
                    <span
                      className="ml-2 line-through"
                      style={{ color: "var(--text-color-secondary)" }}
                    >
                      {tier.launchPrice}
                    </span>
                  </div>
                  <p
                    className="text-sm mb-0"
                    style={{ color: "var(--text-color-secondary)" }}
                  >
                    Preorder price
                  </p>
                </div>

                <ul className="list-none p-0 m-0 mb-4 flex-grow-1">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex align-items-start mb-3">
                      <i
                        className="fa-solid fa-check mr-2 mt-1"
                        style={{ color: tier.color }}
                      ></i>
                      <span style={{ color: "var(--text-color-secondary)" }}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  label="Contact to Preorder"
                  icon="fa-solid fa-envelope"
                  className="p-button-rounded w-full shadow-2"
                  severity={tier.severity}
                  onClick={() =>
                    (window.location.href = `mailto:${contactEmail}?subject=File%20Brain%20Pro%20Preorder%20-%20${encodeURIComponent(
                      tier.name
                    )}`)
                  }
                />
              </div>
            </div>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="mt-8">
          <h3
            className="text-3xl font-bold text-center mb-6"
            style={{ color: "var(--text-color)" }}
          >
            Compare Features
          </h3>
          <div className="overflow-x-auto">
            <table
              className="w-full"
              style={{
                backgroundColor: "white",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "var(--surface-100)" }}>
                  <th
                    className="text-left p-3"
                    style={{ color: "var(--text-color)", fontWeight: "bold" }}
                  >
                    Feature
                  </th>
                  <th
                    className="text-center p-3"
                    style={{ color: "var(--text-color)", fontWeight: "bold" }}
                  >
                    Free
                  </th>
                  <th
                    className="text-center p-3"
                    style={{ color: "var(--text-color)", fontWeight: "bold" }}
                  >
                    Knowledge Engine
                  </th>
                  <th
                    className="text-center p-3"
                    style={{ color: "var(--text-color)", fontWeight: "bold" }}
                  >
                    Media Suite
                  </th>
                  <th
                    className="text-center p-3"
                    style={{ color: "var(--text-color)", fontWeight: "bold" }}
                  >
                    Cloud Connect
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((feature, index) => (
                  <tr
                    key={index}
                    style={{
                      borderBottom:
                        index < comparisonFeatures.length - 1
                          ? "1px solid var(--surface-200)"
                          : "none",
                    }}
                  >
                    <td className="p-3" style={{ color: "var(--text-color)" }}>
                      {feature.name}
                    </td>
                    <td className="text-center p-3">
                      {typeof feature.free === "boolean" ? (
                        feature.free ? (
                          <i
                            className="fa-solid fa-check text-xl"
                            style={{ color: "var(--primary-color)" }}
                          ></i>
                        ) : (
                          <i
                            className="fa-solid fa-xmark text-xl"
                            style={{ color: "var(--text-color-secondary)" }}
                          ></i>
                        )
                      ) : (
                        <span style={{ color: "var(--text-color-secondary)" }}>
                          {feature.free}
                        </span>
                      )}
                    </td>
                    <td className="text-center p-3">
                      {typeof feature.knowledge === "boolean" ? (
                        feature.knowledge ? (
                          <i
                            className="fa-solid fa-check text-xl"
                            style={{ color: "#06b6d4" }}
                          ></i>
                        ) : (
                          <i
                            className="fa-solid fa-xmark text-xl"
                            style={{ color: "var(--text-color-secondary)" }}
                          ></i>
                        )
                      ) : (
                        <span style={{ color: "var(--text-color-secondary)" }}>
                          {feature.knowledge}
                        </span>
                      )}
                    </td>
                    <td className="text-center p-3">
                      {typeof feature.media === "boolean" ? (
                        feature.media ? (
                          <i
                            className="fa-solid fa-check text-xl"
                            style={{ color: "#8b5cf6" }}
                          ></i>
                        ) : (
                          <i
                            className="fa-solid fa-xmark text-xl"
                            style={{ color: "var(--text-color-secondary)" }}
                          ></i>
                        )
                      ) : (
                        <span style={{ color: "var(--text-color-secondary)" }}>
                          {feature.media}
                        </span>
                      )}
                    </td>
                    <td className="text-center p-3">
                      {typeof feature.cloud === "boolean" ? (
                        feature.cloud ? (
                          <i
                            className="fa-solid fa-check text-xl"
                            style={{ color: "#f59e0b" }}
                          ></i>
                        ) : (
                          <i
                            className="fa-solid fa-xmark text-xl"
                            style={{ color: "var(--text-color-secondary)" }}
                          ></i>
                        )
                      ) : (
                        <span style={{ color: "var(--text-color-secondary)" }}>
                          {feature.cloud}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
