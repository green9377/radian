-- DEC-DLV-021 - a parcel that changed hands on the road is SWAPPED, not CANCELLED.
--
-- The owner, 30 Aug 2026: a direct carrier swap must exist and must not count
-- as a failure. A rider's bike breaking is not the rider's failure, and a
-- failure rate that counts it stops meaning anything.
--
-- CANCELLED already existed and stays: it means "this never left". SWAPPED
-- means "this left and somebody else finished it". Folded together, nobody
-- could ever see how often a parcel changes hands mid-journey - the one number
-- that says whether the fleet is breaking down.
--
-- Nothing is back-filled. Every existing CANCELLED row was written before a
-- swap could happen, so re-labelling any of them would be inventing history.

ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'SWAPPED';
