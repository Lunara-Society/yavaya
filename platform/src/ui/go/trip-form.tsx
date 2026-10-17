'use client';

import { useState, type ReactNode } from 'react';
import { GoMap } from './map';

type Kind = 'ride' | 'parcel' | 'errand' | 'assist';
type Point = { latitude: number; longitude: number };

export type TripFormLabels = {
  kinds: Record<Kind, { title: string; text: string }>;
  pickup: Record<Kind, string>;
  dropoff: Record<Kind, string>;
  description: Record<Kind, string>;
  descriptionHint: Record<Kind, string>;
  directionsHint: string;
  vehicle: string;
  vehicleAny: string;
  vehicleMoto: string;
  vehicleCar: string;
  passengers: string;
  fare: string;
  fareHint: string;
  budget: string;
  budgetHint: string;
  whatsapp: string;
  whatsappHint: string;
  city: string;
  submit: string;
  cash: string;
  map: Record<string, string>;
};

/**
 * One form for every kind of job. What it asks changes with the kind — a
 * ride needs passengers, an errand a budget, help in one place no
 * destination — but it posts to a single action that re-checks all of it.
 */
export function TripForm({ action, start, currency, labels, cityField }: { action: (formData: FormData) => void | Promise<void>; start: Point; currency: string; labels: TripFormLabels; cityField: ReactNode }) {
  const [kind, setKind] = useState<Kind>('ride');
  const [vehicle, setVehicle] = useState('any');
  const needsDropoff = kind !== 'assist';

  return (
    <form action={action} className="mk-form go-trip-form">
      <fieldset className="go-kinds">
        {(Object.keys(labels.kinds) as Kind[]).map((key) => (
          <label key={key} className={`go-kind${kind === key ? ' on' : ''}`}>
            <input type="radio" name="kind" value={key} checked={kind === key} onChange={() => setKind(key)} />
            <strong>{labels.kinds[key].title}</strong>
            <span className="muted">{labels.kinds[key].text}</span>
          </label>
        ))}
      </fieldset>

      <label>
        <span>{labels.city}</span>
        {cityField}
      </label>

      {kind === 'ride' ? (
        <div className="go-two">
          <label>
            <span>{labels.vehicle}</span>
            <select name="vehicleWanted" value={vehicle} onChange={(event) => setVehicle(event.target.value)}>
              <option value="any">{labels.vehicleAny}</option>
              <option value="motorcycle">{labels.vehicleMoto}</option>
              <option value="car">{labels.vehicleCar}</option>
            </select>
          </label>
          <label>
            <span>{labels.passengers}</span>
            <select name="passengers" defaultValue="1">
              {(vehicle === 'motorcycle' ? [1] : [1, 2, 3, 4]).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <input type="hidden" name="vehicleWanted" value="any" />
      )}

      <label>
        <span>{labels.description[kind]}</span>
        <textarea name="description" required={kind !== 'ride'} minLength={kind === 'ride' ? undefined : 5} maxLength={500} placeholder={labels.descriptionHint[kind]} />
      </label>

      {kind === 'errand' ? (
        <label>
          <span>{labels.budget}</span>
          <input name="purchaseBudget" inputMode="decimal" placeholder={currency} />
          <small className="hint muted">{labels.budgetHint}</small>
        </label>
      ) : null}

      <h2 className="go-menu-h">{labels.pickup[kind]}</h2>
      <GoMap key={`pickup-${kind}`} mode="pick" initial={start} zoom={14} name="pickup" labels={labels.map} />
      <label>
        <span className="sr-only">{labels.pickup[kind]}</span>
        <textarea name="pickupDirections" required minLength={5} maxLength={300} placeholder={labels.directionsHint} />
      </label>

      {needsDropoff ? (
        <>
          <h2 className="go-menu-h">{labels.dropoff[kind]}</h2>
          <GoMap key={`dropoff-${kind}`} mode="pick" initial={start} zoom={14} name="dropoff" labels={labels.map} />
          <label>
            <span className="sr-only">{labels.dropoff[kind]}</span>
            <textarea name="dropoffDirections" required minLength={5} maxLength={300} placeholder={labels.directionsHint} />
          </label>
        </>
      ) : null}

      <label>
        <span>
          {labels.fare} ({currency})
        </span>
        <input name="offeredFare" required inputMode="decimal" />
        <small className="hint muted">{labels.fareHint}</small>
      </label>
      <label>
        <span>{labels.whatsapp}</span>
        <input name="whatsapp" type="tel" required inputMode="tel" placeholder="+505 8888 1234" />
        <small className="hint muted">{labels.whatsappHint}</small>
      </label>
      <p className="hint muted">{labels.cash}</p>
      <button type="submit" className="btn btn-gold go-wide">
        {labels.submit}
      </button>
    </form>
  );
}
