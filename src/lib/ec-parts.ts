import { ECPartType, type ECPart } from '@roguekeyboards/mykeebs-api-client';

export const EC_PART_TYPES: ECPartType[] = Object.values(ECPartType);

const LABELS: Record<ECPartType, string> = {
	domes: 'Domes',
	sliders: 'Sliders',
	housings: 'Housings',
	springs: 'Springs',
	rings: 'Silencing rings'
};

export function ecPartTypeLabel(type: ECPartType): string {
	return LABELS[type] ?? type;
}

export function ecPartMaterial(part: ECPart): string | undefined {
	return (
		part.domes?.material ??
		part.sliders?.material ??
		part.housings?.material ??
		part.springs?.material ??
		part.rings?.material
	);
}

export function ecPartSpecs(part: ECPart): string[] {
	const specs: (string | undefined)[] = [];
	if (part.domes) {
		specs.push(
			part.domes.weight != null ? `${part.domes.weight}g` : undefined,
			part.domes.material,
			part.domes.color
		);
	}
	if (part.sliders) specs.push(part.sliders.size, part.sliders.stem, part.sliders.material);
	if (part.housings) specs.push(part.housings.size, part.housings.material);
	if (part.springs) specs.push(part.springs.material);
	if (part.rings) {
		specs.push(
			part.rings.material,
			part.rings.thickness != null ? `${part.rings.thickness}mm` : undefined
		);
	}
	return specs.filter((spec): spec is string => Boolean(spec));
}
