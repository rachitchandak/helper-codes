/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{html,js,jsx,ts,tsx}'],
    theme: {
        colors: {
            white: '#ffffff',
            black: '#000000',
            primary: '#1a73e8',
            gray: {
                50: '#f9fafb',
                100: '#f3f4f6',
                500: '#6b7280',
                900: '#111827',
            },
        },
        extend: {
            colors: {
                accent: '#e91e63',
                blue: {
                    500: '#3b82f6',
                    700: '#1d4ed8',
                },
            },
        },
    },
    plugins: [],
};
