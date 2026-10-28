export const MAX_IMAGE_BYTES = 1_572_864;
export const MAX_IMAGE_SIZE = `${MAX_IMAGE_BYTES / 1024 / 1024} MB`;

export class UnsupportedImageError extends Error {
	constructor() {
		super("This browser can't read that image format. Try a JPEG, PNG or WebP.");
		this.name = 'UnsupportedImageError';
	}
}

export class ImageTooLargeError extends Error {
	constructor() {
		super(
			`This photo is too detailed to fit under ${MAX_IMAGE_SIZE}, even shrunk. Try a different one.`
		);
		this.name = 'ImageTooLargeError';
	}
}
