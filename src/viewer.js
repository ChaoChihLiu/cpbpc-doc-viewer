document.addEventListener('DOMContentLoaded', function() {
    const jsContent = document.getElementById('js-content');
    jsContent.style.display = 'block';
    jsContent.innerHTML = 'Loading images...';

    const requestBody = {
        bucketName: '<%= bucket %>',
        hymnNum: '<%= hymnNum %>',
        code: '<%= code %>'
    };

    // Send POST request with JSON body
    fetch('/load-images', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    })
        .then(response => response.json())
        .then(images => {
            jsContent.innerHTML = ''; // Clear "Loading..." message

            images.forEach(image => {
                const imageContainer = document.createElement('div');
                imageContainer.classList.add('image-container');

                const overlay = document.createElement('div');
                overlay.classList.add('image-overlay');

                const imgElem = document.createElement('img');
                imgElem.src = image;
                imgElem.alt = 'image file';

                imageContainer.appendChild(overlay);
                imageContainer.appendChild(imgElem);

                jsContent.appendChild(imageContainer);
            });
        })
        .catch(err => {
            jsContent.innerHTML = 'Error loading images';
            console.error('Error:', err);
        });
});

document.addEventListener('DOMContentLoaded', function() {
    const noJsMessage = document.getElementById('no-js-message');
    if (noJsMessage) {
        noJsMessage.style.display = 'none';
    }

    // Disable right-click context menu
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    // Disable text selection and copying
    document.addEventListener('selectstart', function(e) {
        e.preventDefault();
    });

    document.addEventListener('copy', function(e) {
        e.preventDefault();
    });

    // Disable cut and paste
    document.addEventListener('cut', function(e) {
        e.preventDefault();
    });

    document.addEventListener('paste', function(e) {
        e.preventDefault();
    });

    // Disable common keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && e.key === 'I') ||
            (e.ctrlKey && e.key === 'U') ||
            (e.ctrlKey && e.key === 'C') ||
            (e.ctrlKey && e.key === 'V') ||
            (e.ctrlKey && e.key === 'X')
        ) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    });

    // Disable specific touch actions but allow scrolling
    document.addEventListener('touchstart', function(e) {
        // Disable long press
        if (e.touches.length === 1 && e.timeStamp - e.target.dataset.lastTouchStart < 500) {
            e.preventDefault();
        }
        e.target.dataset.lastTouchStart = e.timeStamp;
    });
});