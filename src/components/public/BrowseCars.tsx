import React from 'react';
import { Helmet } from 'react-helmet-async';
import { CarShowroom } from './CarShowroom';

export function BrowseCars() {
  return (
    <div className="pt-20">
      <Helmet>
        <title>Browse Cars | Car Hire Nairobi — LinkedUp Cars Rentals</title>
        <meta name="description" content="Browse our full fleet of rental cars in Nairobi — luxury sedans, SUVs, budget cars and buses available for self-drive, chauffeur, airport transfers and corporate hire. Book instantly online." />
        <link rel="canonical" href="https://linkedupcarsrentals.com/cars" />
        <meta property="og:title" content="Browse & Book Cars in Nairobi | LinkedUp Cars" />
        <meta property="og:url" content="https://linkedupcarsrentals.com/cars" />
        <meta property="og:description" content="Hire any car in our Nairobi fleet — luxury, SUV, budget, self-drive or chauffeur. Instant booking online." />
      </Helmet>
      <CarShowroom />
    </div>
  );
}
