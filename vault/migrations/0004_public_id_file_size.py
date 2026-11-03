import uuid

from django.db import migrations, models

import vault.models


def populate_public_ids(apps, schema_editor):
    EncryptedDocument = apps.get_model('vault', 'EncryptedDocument')
    for doc in EncryptedDocument.objects.filter(public_id__isnull=True):
        doc.public_id = uuid.uuid4()
        doc.save(update_fields=['public_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('vault', '0003_alter_encrypteddocument_required_nft_address'),
    ]

    operations = [
        migrations.AddField(
            model_name='encrypteddocument',
            name='public_id',
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.RunPython(populate_public_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='encrypteddocument',
            name='public_id',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AddField(
            model_name='encrypteddocument',
            name='file_size',
            field=models.BigIntegerField(default=0, help_text='Size of the encrypted blob in bytes.'),
        ),
        migrations.AlterField(
            model_name='encrypteddocument',
            name='encrypted_file',
            field=models.FileField(upload_to=vault.models.encrypted_blob_path),
        ),
        migrations.AlterField(
            model_name='encrypteddocument',
            name='uploader_wallet',
            field=models.CharField(db_index=True, max_length=44),
        ),
    ]
