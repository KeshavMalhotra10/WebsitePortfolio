document.addEventListener("DOMContentLoaded", function() {
    const navLinks = document.querySelectorAll("#navmenu a[href^='#']");
  
    function updateActiveLink() {
      const scrollPosition = window.pageYOffset;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      let current = "";
  
      // Determine which section based on scroll position
      if (scrollPosition < 267) {
        current = "hero";
      } 
      else if (scrollPosition >= 267 && scrollPosition < 821) {
        current = "about";
      }
      else if (scrollPosition >= 821 && scrollPosition < 1897) {
        current = "portfolio";
      }
      else if (scrollPosition >= 1897 || (scrollPosition + windowHeight >= documentHeight - 100)) {
        current = "contact-me";
      }
  
      // Remove all active classes
      navLinks.forEach(function(link) {
        link.classList.remove("active");
        const icon = link.querySelector("i");
        if (icon) {
          icon.classList.remove("active");
        }
      });
  
      // Add active class to matching link
      navLinks.forEach(function(link) {
        const href = link.getAttribute("href");
        if (href === "#" + current) {
          link.classList.add("active");
        }
      });
    }
  
    // Run on scroll with smooth performance
    let scrollTimeout;
    window.addEventListener("scroll", function() {
      if (scrollTimeout) {
        window.cancelAnimationFrame(scrollTimeout);
      }
      scrollTimeout = window.requestAnimationFrame(updateActiveLink);
    });
  
    // Update on window resize
    let resizeTimeout;
    window.addEventListener("resize", function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateActiveLink, 100);
    });
  
    // Run once on page load
    updateActiveLink();
  });