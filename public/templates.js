// Shared template definitions, used by the server and the control panel.
// Field keys must match the data-field names in overlay.html.
// Field order is the column order in the text file.
(function (root) {
  const TEMPLATES = {
    person: {
      label: "Speaker",
      fields: [
        { key: "name",  label: "Name",  placeholder: "Jane Doe" },
        { key: "title", label: "Title", placeholder: "Executive Producer" },
      ],
      summary: f => [f.name, f.title].filter(Boolean).join(" — "),
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = TEMPLATES;
  else root.TEMPLATES = TEMPLATES;
})(this);
