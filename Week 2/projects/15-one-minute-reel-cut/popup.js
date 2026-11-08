document.addEventListener('DOMContentLoaded', () => {
  const btnQuickSelect = document.getElementById('btnQuickSelect');
  const quickStatus = document.getElementById('quickStatus');

  if (btnQuickSelect) {
    btnQuickSelect.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          quickStatus.textContent = `Selected: ${file.name} (${Math.round(file.size / (1024*1024))} MB). Open full studio to render!`;
          if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.create({ url: 'index.html' });
          }
        }
      };
      input.click();
    });
  }
});
