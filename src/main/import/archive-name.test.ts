import { describe, expect, it } from 'vitest'
import { archiveFolderTrail, cleanArchiveName } from './archive-name'

describe('cleanArchiveName', () => {
  // The 29 zips in the test set, as downloaded (surveyed 2026-10-21).
  const REAL: [string, string | null][] = [
    ['011.zip', null],
    ['72adUDsLSCqqtAFoVuDN_Sticker-Mockup.zip', 'Sticker Mockup'],
    ['9110_poster_mockup_on_construction_fence.zip', '9110 poster mockup on construction fence'],
    ['Apple-Watch-Ultra-Mockup.zip', 'Apple Watch Ultra Mockup'],
    ['B-Mockups-MacBook-16-Pro.zip', 'B Mockups MacBook 16 Pro'],
    ['Board.zip', 'Board'],
    [
      'Floating-Z-Fold-Brand-Brochure-Free-psd-Mockup-TOJ8V2I9-Pixeden.zip',
      'Floating Z Fold Brand Brochure Free psd Mockup TOJ8V2I9 Pixeden'
    ],
    ['Free_2_ID_Cards_Mockup.zip', 'Free 2 ID Cards Mockup'],
    [
      'Free_3_Notebook_Business_Cards_and_Envelope_Mockup.zip',
      'Free 3 Notebook Business Cards and Envelope Mockup'
    ],
    ['Free_Billboard_Mockup.zip', 'Free Billboard Mockup'],
    ['Free_Cap_Mockup.zip', 'Free Cap Mockup'],
    ['Free_Craft_Cup_Mockup.zip', 'Free Craft Cup Mockup'],
    ['Free_Fabric_Shopper_Bag_Mockup.zip', 'Free Fabric Shopper Bag Mockup'],
    ['Free_Fabric_Tote_Bag_Mockup.zip', 'Free Fabric Tote Bag Mockup'],
    ['Free_I_Mockups_iPhone_15.zip', 'Free I Mockups iPhone 15'],
    [
      'Free_Notebook_Envelope_and_Business_Card_Mockup.zip',
      'Free Notebook Envelope and Business Card Mockup'
    ],
    ['Free_Outdoor_Banner_Mockup.zip', 'Free Outdoor Banner Mockup'],
    ['Free_Realistic_Tote_Bag_Mockup.zip', 'Free Realistic Tote Bag Mockup'],
    ['Free_Tote_Bag_Mockup.zip', 'Free Tote Bag Mockup'],
    ['Free_Tote_Bag_Mockup_on_the_Floor.zip', 'Free Tote Bag Mockup on the Floor'],
    ['Free_paper_postal_packages_mockup.zip', 'Free paper postal packages mockup'],
    [
      'Macbook-Pro-Showcase-Screen-Scene-Free-psd-Mockup-PIXEDEN.zip',
      'Macbook Pro Showcase Screen Scene Free psd Mockup PIXEDEN'
    ],
    [
      'PaperBack-Book-on-Mirror-Base-Scene-Free-psd-Mockup.zip',
      'PaperBack Book on Mirror Base Scene Free psd Mockup'
    ],
    ['Qubus.zip', 'Qubus'],
    ['free-iphone-16.zip', 'free iphone 16'],
    ['kvpc5LnfTbKpPbo15cR2_-Hanging-Duct-Tape-Mockup.zip', 'Hanging Duct Tape Mockup'],
    ['q9fHQEg8QQe6QnYgMEvj_Archive.zip', null],
    ['x1YNY2sMQUKWjkiV9pKn_Matte-Snack-Bar-Mockup.zip', 'Matte Snack Bar Mockup'],
    ['y1PjyY3rTTWYuCfHXkQo_Tape-Mockup.zip', 'Tape Mockup']
  ]

  it.each(REAL)('%s reads %s', (name, expected) => {
    expect(cleanArchiveName(name)).toBe(expected)
  })

  it('keeps a long plain word at the start, which is a name and not an ID', () => {
    expect(cleanArchiveName('Photorealisticpacks_Box.zip')).toBe('Photorealisticpacks Box')
  })

  it('needs 16 characters before it calls a prefix an ID', () => {
    expect(cleanArchiveName('a1b2c3d4e5f6g7h_Cup.zip')).toBe('a1b2c3d4e5f6g7h Cup')
  })

  it('drops a .psd left before .zip', () => {
    expect(cleanArchiveName('Free_Cards_Mockup.psd.zip')).toBe('Free Cards Mockup')
  })

  it('says nothing for names made only of generic words', () => {
    for (const n of ['Archive.zip', 'download.zip', 'Files.zip', 'MOCKUP.zip', 'psd.zip'])
      expect(cleanArchiveName(n)).toBeNull()
    expect(cleanArchiveName('Free-PSD-Mockup.zip')).toBeNull()
  })

  it('says nothing for an empty name', () => {
    expect(cleanArchiveName('.zip')).toBeNull()
    expect(cleanArchiveName('__.zip')).toBeNull()
  })
})

describe('archiveFolderTrail', () => {
  it('starts with the zip name, then the folders inside', () => {
    expect(
      archiveFolderTrail(
        ['Apple-Watch-Ultra-Mockup.zip'],
        ['Apple Watch Ultra Mockup/Files/Realistic/a.psd']
      )
    ).toEqual(['Apple Watch Ultra Mockup', 'Realistic'])
  })

  it('drops packaging folders and folders that repeat the zip name', () => {
    expect(
      archiveFolderTrail(['Free_Cap_Mockup.zip'], ['Free_Cap_Mockup/Files/Free_Cap_Mockup.psd'])
    ).toEqual(['Free Cap Mockup'])
    expect(archiveFolderTrail(['Qubus.zip'], ['Qubus/Files/Qubus (EU).psd'])).toEqual(['Qubus'])
  })

  it('trims folder names stored with a trailing space', () => {
    expect(
      archiveFolderTrail(
        ['Board.zip'],
        ['Free_I_Mockups_iPhone_15 /Files/Free iPhone 15 Mockup.psd']
      )
    ).toEqual(['Board', 'Free_I_Mockups_iPhone_15'])
  })

  it('leaves out a zip name that says nothing', () => {
    expect(archiveFolderTrail(['q9fHQEg8QQe6QnYgMEvj_Archive.zip'], ['Lightbox.psd'])).toEqual([])
    expect(archiveFolderTrail(['011.zip'], ['Phones/011.psd'])).toEqual(['Phones'])
  })

  it('follows a zip inside a zip, one name after the other', () => {
    expect(
      archiveFolderTrail(
        [
          'Free_3_Notebook_Business_Cards_and_Envelope_Mockup.zip',
          'Free_3_Notebook_Business_Cards_and_Envelope_Mockup.psd.zip'
        ],
        [
          'Free_3_Notebook_Business_Cards_and_Envelope_Mockup/File/Free_3_Notebook_Business_Cards_and_Envelope_Mockup.psd.zip',
          'Cards/Notebook.psd'
        ]
      )
    ).toEqual(['Free 3 Notebook Business Cards and Envelope Mockup', 'Cards'])
  })

  it('keeps the folders a dropped folder put before the zip', () => {
    expect(archiveFolderTrail(['Cap.zip'], ['Files/Cap.psd'], ['Hats'])).toEqual(['Hats', 'Cap'])
  })
})
