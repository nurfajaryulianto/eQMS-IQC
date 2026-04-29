/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './*.html',
        './js/**/*.js',
    ],
    theme: {
        extend: {
            fontFamily: {
                inter: ['Inter', 'sans-serif'],
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/container-queries'),
    ],
}
