import { db } from '@/lib/firebase';
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/constants';

export const cleanupDemoData = async () => {
  const batch = writeBatch(db);
  let count = 0;

  const collectionsToClean = [
    COLLECTIONS.PROPOSALS,
    COLLECTIONS.PRICING_RULES,
    COLLECTIONS.SCOPES,
    COLLECTIONS.PRICING_CATEGORIES,
  ];

  for (const collName of collectionsToClean) {
    const snapshot = await getDocs(collection(db, collName));
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      count++;
    });
  }

  if (count > 0) {
    await batch.commit();
    console.log(`Successfully cleaned up ${count} demo documents.`);
    return count;
  }
  return 0;
};
