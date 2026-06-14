// Shared Tailwind Play CDN config for the Verge-il static site.
// Loaded immediately after the Tailwind CDN <script> on every page.
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary-container": "#b76dff",
        "on-secondary": "#00344d",
        "inverse-on-surface": "#313030",
        "tertiary": "#ffb2b7",
        "surface-container-high": "#2a2a2a",
        "surface": "#131313",
        "inverse-surface": "#e5e2e1",
        "surface-dim": "#131313",
        "tertiary-fixed-dim": "#ffb2b7",
        "secondary-container": "#00a2e6",
        "surface-container": "#201f1f",
        "on-tertiary": "#67001b",
        "inverse-primary": "#842bd2",
        "on-primary": "#490080",
        "outline-variant": "#4d4354",
        "secondary-fixed": "#c9e6ff",
        "on-error": "#690005",
        "on-background": "#e5e2e1",
        "on-secondary-fixed-variant": "#004c6e",
        "error-container": "#93000a",
        "error": "#ffb4ab",
        "on-tertiary-fixed-variant": "#92002a",
        "on-surface-variant": "#cfc2d6",
        "tertiary-container": "#ff516a",
        "on-secondary-fixed": "#001e2f",
        "primary": "#ddb7ff",
        "on-error-container": "#ffdad6",
        "surface-container-highest": "#353534",
        "on-primary-fixed": "#2c0051",
        "tertiary-fixed": "#ffdadb",
        "on-tertiary-fixed": "#40000d",
        "surface-container-low": "#1c1b1b",
        "primary-fixed": "#f0dbff",
        "surface-bright": "#393939",
        "primary-fixed-dim": "#ddb7ff",
        "on-surface": "#e5e2e1",
        "secondary": "#89ceff",
        "outline": "#988d9f",
        "surface-tint": "#ddb7ff",
        "on-tertiary-container": "#5b0017",
        "secondary-fixed-dim": "#89ceff",
        "surface-container-lowest": "#0e0e0e",
        "background": "#131313",
        "on-primary-container": "#400071",
        "surface-variant": "#353534",
        "on-primary-fixed-variant": "#6900b3",
        "on-secondary-container": "#00344e"
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem"
      },
      spacing: {
        md: "24px",
        sm: "12px",
        xs: "4px",
        gutter: "24px",
        margin: "32px",
        xl: "80px",
        base: "8px",
        lg: "48px"
      },
      fontFamily: {
        "body-md": ["Inter"],
        "headline-lg-mobile": ["Sora"],
        "headline-lg": ["Sora"],
        "headline-xl": ["Sora"],
        "headline-md": ["Sora"],
        "label-caps": ["JetBrains Mono"],
        "body-lg": ["Inter"]
      },
      fontSize: {
        "body-md": ["16px", { lineHeight: "1.5", fontWeight: "400" }],
        "headline-lg-mobile": ["28px", { lineHeight: "1.2", fontWeight: "700" }],
        "headline-lg": ["32px", { lineHeight: "1.2", fontWeight: "700" }],
        "headline-xl": ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "800" }],
        "headline-md": ["24px", { lineHeight: "1.3", fontWeight: "600" }],
        "label-caps": ["12px", { lineHeight: "1", letterSpacing: "0.1em", fontWeight: "700" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }]
      }
    }
  }
};
