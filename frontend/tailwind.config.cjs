/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx,js,jsx,html}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        brand: {
          rose: "#EA7B7B",
          red: "#D25353",
          wine: "#9E3B3B",
          cream: "#FFEAD3",
        },
      },
    },
  },
  plugins: [],
};
