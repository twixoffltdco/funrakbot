/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Акцент проекта — «изумрудный» как в интерфейсах FR_ чатов
        accent: '#34d399',
      },
    },
  },
  plugins: [],
};
