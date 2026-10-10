// src/components/fly/PlaceSearch.tsx
// Place-name search for the Earth flight toolbar (docs/plan-fly-map-data.md §2): type a name, pick a result, land
// there. A thin UI shell over lib/fly/earth/geocode.ts's debounced searcher - all the rate-limit/abort logic lives
// there and is unit-tested without a browser; this component is just the input, the dropdown and the keyboard nav.
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Input, List, ListItem, Text } from '@chakra-ui/react';
import { type GeocodeResult, makeDebouncedSearcher, searchPlace } from '@/lib/fly/earth/geocode';

export interface PlaceSearchProps {
	onSelect: (lat: number, lon: number, label: string) => void;
	glass: Record<string, unknown>;
}

export default function PlaceSearch({ onSelect, glass }: PlaceSearchProps) {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<GeocodeResult[]>([]);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const lastQuery = useRef('');

	const debounced = useMemo(
		() => makeDebouncedSearcher(searchPlace, (r, q) => { if (q === lastQuery.current) { setResults(r); setOpen(r.length > 0); setActive(0); } }),
		[],
	);
	useEffect(() => () => debounced.cancel(), [debounced]);

	const onChange = (q: string) => {
		setQuery(q);
		lastQuery.current = q.trim();
		if (q.trim().length < 2) { debounced.cancel(); setResults([]); setOpen(false); return; }
		debounced(q);
	};

	const pick = (r: GeocodeResult) => {
		onSelect(r.lat, r.lon, r.label);
		setQuery(r.label.split(',')[0]);
		setOpen(false);
		debounced.cancel();
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (!open || results.length === 0) return;
		if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
		else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
		else if (e.key === 'Escape') { setOpen(false); }
	};

	return (
		<Box position="relative">
			<Input
				size="xs" w="170px" placeholder="Search a place…" value={query}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={onKeyDown}
				onBlur={() => window.setTimeout(() => setOpen(false), 150)} // lets a click on a result register before the list disappears
				onFocus={() => { if (results.length) setOpen(true); }}
				aria-label="Search for a place to fly to"
				aria-expanded={open}
				aria-controls="place-search-results"
				role="combobox"
				data-testid="earth-place-search"
			/>
			{open && (
				<List
					id="place-search-results" role="listbox" position="absolute" top="calc(100% + 4px)" left={0} w="260px" maxH="220px" overflowY="auto" zIndex={10}
					{...glass} py={1}
				>
					{results.map((r, i) => (
						<ListItem
							key={`${r.lat},${r.lon}`} role="option" aria-selected={i === active}
							px={3} py={1.5} cursor="pointer" fontSize="sm"
							bg={i === active ? 'whiteAlpha.200' : undefined}
							onMouseEnter={() => setActive(i)}
							onMouseDown={(e) => { e.preventDefault(); pick(r); }} // mousedown (not click) fires before the input's onBlur closes the list
							data-testid="earth-place-search-result"
						>
							<Text noOfLines={1}>{r.label}</Text>
						</ListItem>
					))}
				</List>
			)}
		</Box>
	);
}
