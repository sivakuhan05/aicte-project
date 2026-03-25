document.addEventListener('DOMContentLoaded', () => {
  const organizerUsername = localStorage.getItem('organizerUsername');
  if (!organizerUsername) {
    window.location.href = 'orglog.html';
    return;
  }

  const queryParams = new URLSearchParams(window.location.search);
  const editingEventId = (queryParams.get('eventId') || '').trim();
  const isEditing = Boolean(editingEventId);
  const fileInput = document.getElementById('eventImage');
  const base64Input = document.getElementById('base64Image');
  const imagePreview = document.getElementById('imagePreview');
  const eventForm = document.getElementById('eventForm');
  const yesBtn = document.getElementById('yesBtn');
  const noBtn = document.getElementById('noBtn');
  const urlInputContainer = document.getElementById('urlInputContainer');
  const externalFormUrl = document.getElementById('externalFormUrl');
  const accessAllBtn = document.getElementById('accessAllBtn');
  const accessDeptBtn = document.getElementById('accessDeptBtn');
  const departmentAccessCard = document.getElementById('departmentAccessCard');
  const departmentInputs = Array.from(document.querySelectorAll('input[name="allowedDepartment"]'));
  const pageEyebrow = document.getElementById('host-page-eyebrow');
  const pageTitle = document.getElementById('host-page-title');
  const pageDescription = document.getElementById('host-page-description');
  const submitButton = document.getElementById('submit-event-btn');
  let accessScope = 'all';
  let existingImageDataUrl = '';
  let loadedEvent = null;

  function setExternalFormVisibility(showUrl) {
    urlInputContainer.style.display = showUrl ? 'block' : 'none';
    yesBtn.classList.toggle('active', showUrl);
    noBtn.classList.toggle('active', !showUrl);
    if (!showUrl) {
      externalFormUrl.value = '';
    }
  }

  function setAccessMode(mode) {
    accessScope = mode === 'department' ? 'department' : 'all';
    accessAllBtn.classList.toggle('active', accessScope === 'all');
    accessDeptBtn.classList.toggle('active', accessScope === 'department');
    departmentAccessCard.style.display = accessScope === 'department' ? 'block' : 'none';

    if (accessScope !== 'department') {
      departmentInputs.forEach((input) => {
        input.checked = false;
      });
    }
  }

  function formatInputDate(dateValue) {
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatInputTime(dateValue) {
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function resolveImageDataUrl(eventData) {
    if (eventData.image) {
      return eventData.image;
    }

    const eventImage = eventData.eventImage;
    if (eventImage && eventImage.data && eventImage.contentType) {
      return `data:${eventImage.contentType};base64,${eventImage.data}`;
    }

    return '';
  }

  function populateEditForm(eventData) {
    document.getElementById('eventName').value = eventData.eventName || '';
    document.getElementById('eventCategory').value = eventData.category || '';
    document.getElementById('eventDateInput').value = formatInputDate(eventData.eventDate);
    document.getElementById('eventTimeInput').value = formatInputTime(eventData.eventDate);
    document.getElementById('eventLocation').value = eventData.eventLocation || '';
    document.getElementById('eventDescription').value = eventData.eventDescription || '';
    externalFormUrl.value = eventData.externalFormUrl || '';
    setExternalFormVisibility(Boolean(eventData.externalFormUrl));

    const nextAccessMode = String(eventData.accessScope || 'all').toLowerCase() === 'department'
      ? 'department'
      : 'all';
    setAccessMode(nextAccessMode);

    departmentInputs.forEach((input) => {
      input.checked = Array.isArray(eventData.allowedDepartments)
        ? eventData.allowedDepartments.includes(input.value)
        : false;
    });

    existingImageDataUrl = resolveImageDataUrl(eventData);
    if (existingImageDataUrl) {
      imagePreview.src = existingImageDataUrl;
      imagePreview.style.display = 'block';
    } else {
      imagePreview.style.display = 'none';
      imagePreview.removeAttribute('src');
    }

    base64Input.value = '';
  }

  async function loadEventForEditing() {
    const response = await fetch(`http://localhost:3000/events/${encodeURIComponent(editingEventId)}`);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Failed to load event.');
    }

    if ((result.organizerUsername || '') !== organizerUsername) {
      throw new Error('You can only edit your own events.');
    }

    loadedEvent = result;
    populateEditForm(result);
  }

  setExternalFormVisibility(false);
  setAccessMode('all');

  if (isEditing) {
    fileInput.required = false;
    if (pageEyebrow) {
      pageEyebrow.textContent = 'Event update';
    }
    if (pageTitle) {
      pageTitle.textContent = 'Edit Event';
    }
    if (pageDescription) {
      pageDescription.textContent = 'Update the event details, poster, access, and registration link for this hosted event.';
    }
    if (submitButton) {
      submitButton.textContent = 'Save Changes';
    }
  }

  yesBtn.addEventListener('click', () => setExternalFormVisibility(true));
  noBtn.addEventListener('click', () => setExternalFormVisibility(false));
  accessAllBtn.addEventListener('click', () => setAccessMode('all'));
  accessDeptBtn.addEventListener('click', () => setAccessMode('department'));

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) {
      base64Input.value = '';
      if (existingImageDataUrl) {
        imagePreview.src = existingImageDataUrl;
        imagePreview.style.display = 'block';
      } else {
        imagePreview.style.display = 'none';
        imagePreview.removeAttribute('src');
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      base64Input.value = event.target.result;
      imagePreview.src = event.target.result;
      imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });

  eventForm.addEventListener('reset', () => {
    if (!isEditing || !loadedEvent) {
      existingImageDataUrl = '';
      setTimeout(() => {
        base64Input.value = '';
        imagePreview.style.display = 'none';
        imagePreview.removeAttribute('src');
        setExternalFormVisibility(false);
        setAccessMode('all');
      }, 0);
      return;
    }

    setTimeout(() => populateEditForm(loadedEvent), 0);
  });

  async function initializeEditState() {
    if (!isEditing) {
      return true;
    }

    try {
      await loadEventForEditing();
      return true;
    } catch (error) {
      console.error('Error loading event for editing:', error);
      alert(error.message || 'Unable to load the selected event for editing.');
      window.location.href = 'organizedevent.html';
      return false;
    }
  }

  eventForm.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();

    const eventDateInput = document.getElementById('eventDateInput').value;
    const eventTimeInput = document.getElementById('eventTimeInput').value;
    const combinedEventDate = eventDateInput && eventTimeInput
      ? `${eventDateInput}T${eventTimeInput}`
      : '';

    const formData = {
      organizerUsername,
      eventName: document.getElementById('eventName').value.trim(),
      category: document.getElementById('eventCategory').value,
      eventDate: combinedEventDate,
      clubAssociation: localStorage.getItem('organizerAssociation') || '',
      accessScope,
      allowedDepartments: departmentInputs
        .filter((input) => input.checked)
        .map((input) => input.value),
      eventLocation: document.getElementById('eventLocation').value.trim(),
      eventDescription: document.getElementById('eventDescription').value.trim(),
      base64Image: document.getElementById('base64Image').value,
      externalFormUrl: externalFormUrl.value.trim()
    };

    if (!formData.eventDate) {
      alert('Please choose both the event date and the event time.');
      return;
    }

    if (!formData.base64Image && !existingImageDataUrl) {
      alert('Please upload an event image.');
      return;
    }

    if (formData.accessScope === 'department' && !formData.allowedDepartments.length) {
      alert('Please choose at least one allowed department for this event.');
      return;
    }

    try {
      const response = await fetch(
        isEditing
          ? `http://localhost:3000/events/${encodeURIComponent(editingEventId)}`
          : 'http://localhost:3000/events',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || (isEditing ? 'Failed to update event' : 'Failed to create event'));
      }

      alert(result.message || (isEditing ? 'Event updated and sent for admin approval.' : 'Event submitted successfully.'));

      if (isEditing) {
        window.location.href = 'organizedevent.html';
        return;
      }

      eventForm.reset();
      base64Input.value = '';
      existingImageDataUrl = '';
      imagePreview.style.display = 'none';
      imagePreview.removeAttribute('src');
      setExternalFormVisibility(false);
      setAccessMode('all');
    } catch (error) {
      console.error('Error submitting event:', error);
      alert(error.message || (isEditing ? 'Server error while updating the event.' : 'Server error while creating the event.'));
    }
  });

  initializeEditState();
});
