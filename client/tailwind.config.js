export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        park: {
          dark: "#0B1020",
          green: "#111111",
          "green-hover": "#292929",
          "green-soft": "#F0F0F0",
          gold: "#F0F0F0",
          "gold-hover": "#E3E3E3",
          "gold-soft": "#F4F4F4",
          black: "#0B1020",
          white: "#FFFFFF",
          bg: "#F6F6F6",
          border: "#C9C9C9",
          text: "#101010",
          muted: "#5E5E5E",
          danger: "#111111",
          "danger-hover": "#292929",
          "danger-soft": "#F2F2F2"
        }
      },
      fontFamily: {
        display: ["Poppins", "Inter", "ui-sans-serif", "system-ui"],
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        body: ["Roboto", "Inter", "ui-sans-serif", "system-ui"]
      },
      boxShadow: {
        soft: "0 8px 24px rgba(11, 16, 32, 0.07)",
        card: "0 12px 32px rgba(17, 34, 68, 0.08)",
        dropdown: "0 16px 34px rgba(11, 16, 32, 0.14)",
        drawer: "0 22px 52px rgba(11, 16, 32, 0.24)",
        modal: "0 26px 72px rgba(11, 16, 32, 0.24)"
      },
      borderRadius: {
        input: "8px",
        button: "8px",
        card: "12px",
        panel: "16px",
        modal: "16px"
      }
    }
  },
  plugins: []
};
