const menuButton = document.querySelector(".menu-button");
const menu = document.querySelector("#main-menu");

if (menuButton && menu) {
    menuButton.addEventListener("click", () => {
        const isOpen = menu.classList.toggle("is-open");
        menuButton.setAttribute("aria-expanded", String(isOpen));
    });
}

const searchInput = document.querySelector("#post-search");
const posts = [...document.querySelectorAll(".post-card")];
const emptyMessage = document.querySelector(".empty-message");

if (searchInput && posts.length) {
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim().toLowerCase();
        let visibleCount = 0;

        posts.forEach((post) => {
            const matches = post.dataset.search.toLowerCase().includes(query);
            post.hidden = !matches;
            if (matches) visibleCount += 1;
        });

        if (emptyMessage) emptyMessage.hidden = visibleCount !== 0;
    });
}
